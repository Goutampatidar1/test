/**
 * Ensures the admin user from MONGODB_URI exists (bootstrap via local no-auth admin).
 * Run once when auth URI fails with "Authentication failed."
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const mongoose = require("mongoose");

const AUTH_URI = process.env.MONGODB_URI || "";
const BOOTSTRAP_URI = process.env.MONGODB_BOOTSTRAP_URI || "mongodb://127.0.0.1:27017/admin";

function parseAuthUri(uri) {
  const raw = String(uri || "").trim();
  if (!raw.includes("@")) return null;
  try {
    const normalized = raw.replace(/^mongodb:\/\//, "http://");
    const url = new URL(normalized);
    if (!url.username || !url.password) return null;
    const authSource = url.searchParams.get("authSource") || "admin";
    const db = url.pathname.replace(/^\//, "") || "admin";
    return {
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      db,
      authSource,
    };
  } catch {
    return null;
  }
}

async function main() {
  const auth = parseAuthUri(AUTH_URI);
  if (!auth) {
    throw new Error("Set MONGODB_URI to an authenticated connection string first.");
  }

  try {
    await mongoose.connect(AUTH_URI);
    console.log("Admin user already works — auth connection OK.");
    return;
  } catch (err) {
    if (!String(err.message).includes("Authentication failed")) {
      throw err;
    }
    console.log("Auth failed — creating/updating admin user via bootstrap connection…");
  }

  await mongoose.disconnect().catch(() => {});
  await mongoose.connect(BOOTSTRAP_URI);
  const db = mongoose.connection.db;

  try {
    await db.command({
      createUser: auth.user,
      pwd: auth.password,
      roles: [{ role: "root", db: auth.authSource }],
    });
    console.log(`Created MongoDB user "${auth.user}".`);
  } catch (err) {
    if (String(err.message).includes("already exists")) {
      await db.command({
        updateUser: auth.user,
        pwd: auth.password,
        roles: [{ role: "root", db: auth.authSource }],
      });
      console.log(`Updated password for MongoDB user "${auth.user}".`);
    } else {
      throw err;
    }
  }

  await mongoose.disconnect();
  await mongoose.connect(AUTH_URI);
  console.log("Auth connection OK.");
}

main()
  .catch((err) => {
    console.error("ensureMongoAdmin failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
