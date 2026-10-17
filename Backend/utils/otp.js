const crypto = require("crypto");

const OTP_LENGTH = 4; // 4 digit OTP
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** After OTP is verified, vendor/user can finish the registration form within this window. */
const REGISTER_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateOtp() {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/**
 * Phones listed in FIXED_OTP_PHONE / FIXED_OTP_PHONES always get FIXED_OTP (default 1234).
 * Comma-separated 10-digit mobiles; used for Play Store / QA demo accounts.
 * Built-in demo accounts (always included):
 * - 7878545478 vendor
 * - 8956456454 driver
 */
const BUILTIN_FIXED_OTP_PHONES = ["7878545478", "8956456454"];

function getFixedOtpPhones() {
  const raw = process.env.FIXED_OTP_PHONES || process.env.FIXED_OTP_PHONE || "";
  const fromEnv = String(raw)
    .split(/[,;\s]+/)
    .map((value) => String(value || "").replace(/\D/g, "").slice(-10))
    .filter((digits) => digits.length === 10);
  return [...new Set([...BUILTIN_FIXED_OTP_PHONES, ...fromEnv])];
}

function getFixedOtpValue() {
  const value = String(process.env.FIXED_OTP || "1234").trim();
  if (/^\d{4}$/.test(value)) return value;
  return "1234";
}

function isFixedOtpPhone(phoneNorm) {
  const digits = String(phoneNorm || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return false;
  return getFixedOtpPhones().includes(digits);
}

/** Prefer fixed OTP for configured demo phones; otherwise random. */
function resolveOtpForPhone(phoneNorm) {
  if (isFixedOtpPhone(phoneNorm)) {
    return getFixedOtpValue();
  }
  return generateOtp();
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
  resolveOtpForPhone,
  isFixedOtpPhone,
  getFixedOtpValue,
  otpExpiryDate,
  registrationSessionExpiryDate,
  isOtpExpired,
  devOnlyOtp,
};
