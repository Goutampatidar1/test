/**
 * Print which DB the backend uses and whether the seed admin exists.
 * Run on the server: node scripts/checkAdmin.js
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const mongoose = require("mongoose");
const config = require("../config");
const { Admin } = require("../models");

const SEED_EMAIL = "admin@gmail.com";

async function main() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is not set in Backend/.env");
  }

  await mongoose.connect(config.mongodbUri);
  const dbName = mongoose.connection.name;
  const admin = await Admin.findOne({ email: SEED_EMAIL.toLowerCase() }).select("email status name");

  console.log("Connected database:", dbName);
  console.log("MONGODB_URI host/db:", maskUri(config.mongodbUri));

  if (!admin) {
    console.log(`Admin "${SEED_EMAIL}" NOT FOUND — run: npm run seed`);
    return;
  }

  console.log("Admin found:", admin.email, "| status:", admin.status, "| name:", admin.name);
  console.log("If login still fails, reset password: npm run reset-admin");
}

function maskUri(uri) {
  return String(uri).replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}

main()
  .catch((err) => {
    console.error("checkAdmin failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
