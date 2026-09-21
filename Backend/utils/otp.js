const crypto = require("crypto");

const OTP_LENGTH = 4; // 4 digit OTP
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** After OTP is verified, vendor/user can finish the registration form within this window. */
const REGISTER_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateOtp() {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

function otpExpiryDate() {
  return new Date(Date.now() + OTP_TTL_MS);
}

function registrationSessionExpiryDate() {
  return new Date(Date.now() + REGISTER_SESSION_TTL_MS);
}

function isOtpExpired(expireAt) {
  if (!expireAt) return true;
  return new Date(expireAt).getTime() <= Date.now();
}

/** Include OTP in API JSON only for local dev or when EXPOSE_OTP_IN_RESPONSE=true (staging). */
function devOnlyOtp(otp) {
  if (process.env.NODE_ENV === "development") return otp;
  if (String(process.env.EXPOSE_OTP_IN_RESPONSE || "").toLowerCase() === "true") return otp;
  return undefined;
}

module.exports = {
  OTP_TTL_MS,
  REGISTER_SESSION_TTL_MS,
  generateOtp,
  otpExpiryDate,
  registrationSessionExpiryDate,
  isOtpExpired,
  devOnlyOtp,
};
