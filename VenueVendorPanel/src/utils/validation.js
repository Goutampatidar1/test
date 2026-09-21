/** Email must use @ and end with .com, .co.in, .in, or .net */
export const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(co\.in|com|in|net)$/i;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
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

export function isValidEmail(email) {
  const value = String(email ?? "").trim();
  return Boolean(value) && EMAIL_REGEX.test(value);
}

export function validateEmailMessage(email, { required = true } = {}) {
  const value = String(email ?? "").trim();
  if (!value) return required ? "Email address is required." : "";
  if (!EMAIL_REGEX.test(value)) {
    return "Enter a valid email ending with .com, .co.in, .in, or .net.";
  }
  return "";
}

export function validatePanMessage(pan, { required = true } = {}) {
  const value = String(pan ?? "").trim().toUpperCase();
  if (!value) return required ? "PAN number is required." : "";
  if (!/^[A-Z0-9]+$/.test(value)) return "PAN number must contain letters and digits only.";
  if (value.length !== 10) return "PAN number must be exactly 10 characters.";
  return "";
}

export function validateGstMessage(gst, { required = true } = {}) {
  const value = String(gst ?? "").trim().toUpperCase();
  if (!value) return required ? "GST number is required." : "";
  if (!/^[A-Z0-9]+$/.test(value)) return "GST number must contain letters and digits only.";
  if (value.length !== 15) return "GST number must be exactly 15 characters.";
  return "";
}
