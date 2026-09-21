/**
 * Email must contain @ and end with .com, .net, .co.in, or .in
 * Examples: user@gmail.com, user@company.net, user@company.co.in
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.(co\.in|com|in|net)$/i;

export function isValidEmail(email) {
  const value = String(email ?? "").trim();
  return Boolean(value) && EMAIL_REGEX.test(value);
}

export function validateEmailMessage(email, { required = true } = {}) {
  const value = String(email ?? "").trim();
  if (!value) return required ? "Email is required." : "";
  if (!EMAIL_REGEX.test(value)) {
    return "Please enter a valid email ending with .com, .net, .co.in, or .in.";
  }
  return "";
}

export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export function sanitizePhoneInput(value) {
  let digits = String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 10);
  while (digits.length > 0 && !/[6-9]/.test(digits[0])) {
    digits = digits.slice(1);
  }
  return digits;
}

export function isValidIndianMobile(phone) {
  const value = String(phone ?? "").trim();
  return Boolean(value) && INDIAN_MOBILE_REGEX.test(value);
}

export function validateIndianMobileMessage(phone, { required = true, label = "Mobile number" } = {}) {
  const value = String(phone ?? "").trim();
  if (!value) return required ? `${label} is required.` : "";
  if (!/^\d+$/.test(value)) return `${label} should contain digits only.`;
  if (value.length !== 10) return `${label} must be exactly 10 digits.`;
  if (!INDIAN_MOBILE_REGEX.test(value)) {
    return `Enter a valid Indian ${label.toLowerCase()} (starts with 6, 7, 8, or 9).`;
  }
  return "";
}

export const INDIAN_PINCODE_REGEX = /^\d{6}$/;

export function sanitizePincodeInput(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

export function validatePincodeMessage(pincode, { required = false, label = "Pincode" } = {}) {
  const value = String(pincode ?? "").trim();
  if (!value) return required ? `${label} is required.` : "";
  if (!/^\d+$/.test(value)) return `${label} should contain digits only.`;
  if (value.length !== 6) return `${label} must be exactly 6 digits.`;
  return "";
}

/** Local calendar date as YYYY-MM-DD for `<input type="date">`. */
export function todayDateInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function yearsAgoDateInputValue(years, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setFullYear(d.getFullYear() - years);
  return todayDateInputValue(d);
}

export function validateDateOfBirthMessage(
  dobValue,
  { minAgeYears = 5, maxAgeYears = 100, required = false } = {},
) {
  const dob = String(dobValue ?? "").trim();
  if (!dob) return required ? "Date of birth is required." : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return "Please select a valid date of birth.";
  }

  const today = todayDateInputValue();
  if (dob > today) return "Date of birth cannot be in the future.";

  if (minAgeYears > 0 && dob > yearsAgoDateInputValue(minAgeYears)) {
    return `User must be at least ${minAgeYears} years old.`;
  }

  if (maxAgeYears > 0 && dob < yearsAgoDateInputValue(maxAgeYears)) {
    return `Age cannot be more than ${maxAgeYears} years.`;
  }

  return "";
}

/** Indian vehicle registration (e.g. MH 12 AB 1234, MP09AB0000). */
const VEHICLE_REG_COMPACT_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;

export function compactVehicleRegistration(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function validateIndianVehicleRegistrationMessage(
  registration,
  { required = true, label = "Vehicle registration number" } = {},
) {
  const compact = compactVehicleRegistration(registration);
  if (!compact) return required ? `${label} is required.` : "";
  if (compact.length < 8 || compact.length > 12) {
    return `Enter a valid ${label.toLowerCase()} (e.g. MH 12 AB 1234).`;
  }
  if (!VEHICLE_REG_COMPACT_REGEX.test(compact)) {
    return `Enter a valid ${label.toLowerCase()} (state code, district, series, and 4-digit number).`;
  }
  return "";
}

/** Indian driving license — 10–20 alphanumeric characters (slashes/hyphens allowed). */
const DRIVING_LICENSE_REGEX = /^[A-Za-z0-9][A-Za-z0-9/-]{9,19}$/;

export function validateIndianDrivingLicenseMessage(
  license,
  { required = true, label = "Driving license number" } = {},
) {
  const value = String(license ?? "").trim().toUpperCase();
  if (!value) return required ? `${label} is required.` : "";
  if (!DRIVING_LICENSE_REGEX.test(value)) {
    return `${label} must be 10–20 characters (letters, numbers, / or -).`;
  }
  return "";
}

export function validateVehicleTypeMessage(
  vehicleType,
  { required = true, maxLength = 40, label = "Vehicle type" } = {},
) {
  const value = String(vehicleType ?? "").trim();
  if (!value) return required ? `${label} is required.` : "";
  if (value.length < 2) return `${label} must be at least 2 characters.`;
  if (value.length > maxLength) return `${label} cannot exceed ${maxLength} characters.`;
  if (!/^[A-Za-z0-9 ]+$/.test(value)) {
    return `${label} can contain only letters, numbers, and spaces.`;
  }
  return "";
}
