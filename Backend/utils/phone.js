const AppError = require("./AppError");

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

function assertValidIndianMobile(digits) {
  if (!INDIAN_MOBILE_REGEX.test(digits)) {
    throw new AppError(
      "Invalid phone number. Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.",
      400,
    );
  }
}

/**
 * Normalize mobile numbers (India-first): keep last 10 digits when possible.
 */
function normalizePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new AppError("Phone number is required", 400);
  }

  if (digits.length === 10) {
    assertValidIndianMobile(digits);
    return digits;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    const normalized = digits.slice(2);
    assertValidIndianMobile(normalized);
    return normalized;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    const normalized = digits.slice(1);
    assertValidIndianMobile(normalized);
    return normalized;
  }

  throw new AppError("Invalid phone number. Use a 10-digit mobile number", 400);
}

/**
 * Include formats stored by older versions of the application.
 */
function phoneLookupValues(phone) {
  const normalized = normalizePhone(phone);
  return [
    normalized,
    `91${normalized}`,
    `+91${normalized}`,
    `0${normalized}`,
  ];
}

module.exports = { normalizePhone, phoneLookupValues };
