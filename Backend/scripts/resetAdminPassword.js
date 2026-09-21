/**
 * Reset seed admin password (admin@gmail.com / 12345678).
 * Run on the server after pointing Backend/.env to the live MongoDB.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const mongoose = require("mongoose");
const config = require("../config");
const { Admin } = require("../models");
const { hashPassword } = require("../utils/password");

const ADMIN = {
  name: "Admin",
  email: "admin@gmail.com",
  password: "12345678",
  phone: "9876543200",
  status: "active",
};

async function main() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is not set in Backend/.env");
  }

  await mongoose.connect(config.mongodbUri);
  const email = ADMIN.email.toLowerCase();
  const hashed = await hashPassword(ADMIN.password);
  let admin = await Admin.findOne({ email });

  if (admin) {
    admin.name = ADMIN.name;
    admin.password = hashed;
    admin.phone = ADMIN.phone;
    admin.status = ADMIN.status;
    await admin.save();
    console.log(`Updated admin in database "${mongoose.connection.name}": ${email}`);
  } else {
    admin = await Admin.create({
      name: ADMIN.name,
      email,
      password: hashed,
      phone: ADMIN.phone,
      status: ADMIN.status,
    });
    console.log(`Created admin in database "${mongoose.connection.name}": ${email}`);
  }

  console.log("Login with:");
  console.log(`  Email:    ${ADMIN.email}`);
  console.log(`  Password: ${ADMIN.password}`);
}

main()
  .catch((err) => {
    console.error("resetAdminPassword failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
