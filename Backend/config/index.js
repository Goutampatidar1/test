require("dotenv").config();

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const portRaw = Number(process.env.PORT);
const port =
  Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 5000;

const mongodbUri = process.env.MONGODB_URI || "";

const jwtSecret =
  process.env.JWT_SECRET ||
  (isProduction ? "" : "dev-only-change-me");

if (isProduction) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required when NODE_ENV is production");
  }
  if (!mongodbUri) {
    throw new Error("MONGODB_URI is required when NODE_ENV is production");
  }
}

module.exports = {
  port,
  nodeEnv,
  isProduction,
  mongodbUri,

  /**
   * JWT settings. Access token fields are used by auth today.
   * Other secrets are read from env for upcoming refresh / email / reset flows.
   */
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || "365d",

    refreshSecret:
      process.env.JWT_REFRESH_SECRET || jwtSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "365d",

    resetPasswordSecret:
      process.env.JWT_RESET_PASSWORD_SECRET || jwtSecret,
    resetPasswordExpiresIn:
      process.env.JWT_RESET_PASSWORD_EXPIRES_IN || "1h",

    verifyEmailSecret:
      process.env.JWT_VERIFY_EMAIL_SECRET || jwtSecret,
    verifyEmailExpiresIn:
      process.env.JWT_VERIFY_EMAIL_EXPIRES_IN || "24h",
  },
};
