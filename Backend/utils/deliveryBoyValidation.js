const AppError = require("./AppError");

const VEHICLE_REG_COMPACT_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;
const DRIVING_LICENSE_REGEX = /^[A-Z0-9][A-Z0-9/-]{9,19}$/;
const VEHICLE_TYPE_REGEX = /^[A-Za-z0-9 ]+$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BANK_TEXT_REGEX = /^[A-Za-z0-9 ]+$/;

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function compactVehicleRegistration(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

function validateVehicleRegistration(value, { required = false } = {}) {
  const compact = compactVehicleRegistration(value);
  if (!compact) {
    if (required) throw new AppError("Vehicle registration number is required", 400);
    return null;
  }
  if (!VEHICLE_REG_COMPACT_REGEX.test(compact)) {
    throw new AppError(
      "Invalid vehicle registration number. Use format like MH 12 AB 1234",
      400
    );
  }
  return compact;
}

function validateLicenseNumber(value, { required = false } = {}) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!normalized) {
    if (required) throw new AppError("Driving license number is required", 400);
    return null;
  }
  if (!DRIVING_LICENSE_REGEX.test(normalized)) {
    throw new AppError(
      "Invalid driving license number. Use 10–20 letters, numbers, / or -",
      400
    );
  }
  return normalized;
}

function validateVehicleType(value, { required = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    if (required) throw new AppError("Vehicle type is required", 400);
    return null;
  }
  if (normalized.length < 2 || normalized.length > 40) {
    throw new AppError("Vehicle type must be between 2 and 40 characters", 400);
  }
  if (!VEHICLE_TYPE_REGEX.test(normalized)) {
    throw new AppError(
      "Vehicle type can contain only letters, numbers, and spaces",
      400
    );
  }
  return normalized;
}

function validateBankTextField(value, label, { required = false, maxLength = 80 } = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    if (required) throw new AppError(`${label} is required`, 400);
    return null;
  }
  if (normalized.length < 2) {
    throw new AppError(`${label} must be at least 2 characters`, 400);
  }
  if (normalized.length > maxLength) {
    throw new AppError(`${label} cannot exceed ${maxLength} characters`, 400);
  }
  if (!BANK_TEXT_REGEX.test(normalized)) {
    throw new AppError(`${label} can contain only letters, numbers, and spaces`, 400);
  }
  return normalized;
}

function validateIfscCode(value, { required = false } = {}) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!normalized) {
    if (required) throw new AppError("IFSC code is required", 400);
    return null;
  }
  if (!IFSC_REGEX.test(normalized)) {
    throw new AppError("Invalid IFSC code", 400);
  }
  return normalized;
}

function validateAccountNumber(value, { required = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    if (required) throw new AppError("Account number is required", 400);
    return null;
  }
  if (!/^\d{9,18}$/.test(normalized)) {
    throw new AppError("Account number must be 9–18 digits", 400);
  }
  return normalized;
}

function assertDeliveryVehicleFields(body, { requireAll = false } = {}) {
  const hasVehicleField =
    Object.prototype.hasOwnProperty.call(body, "vehicleRegistrationNumber") ||
    Object.prototype.hasOwnProperty.call(body, "licenseNumber") ||
    Object.prototype.hasOwnProperty.call(body, "vehicleType");

  if (!requireAll && !hasVehicleField) return {};

  const vehicleRegistrationNumber = validateVehicleRegistration(
    body.vehicleRegistrationNumber,
    { required: requireAll }
  );
  const licenseNumber = validateLicenseNumber(body.licenseNumber, { required: requireAll });
  const vehicleType = validateVehicleType(body.vehicleType, { required: requireAll });

  return {
    vehicleRegistrationNumber,
    licenseNumber,
    vehicleType,
  };
}

function assertDeliveryBankFields(body, { requireAll = false } = {}) {
  const hasBankField = [
    "bankAccountName",
    "accountNumber",
    "bankName",
    "branchName",
    "ifscCode",
  ].some((key) => Object.prototype.hasOwnProperty.call(body, key));

  if (!requireAll && !hasBankField) return {};

  return {
    bankAccountName: validateBankTextField(body.bankAccountName, "Bank account name", {
      required: requireAll,
      maxLength: 80,
    }),
    accountNumber: validateAccountNumber(body.accountNumber, { required: requireAll }),
    bankName: validateBankTextField(body.bankName, "Bank name", {
      required: requireAll,
      maxLength: 80,
    }),
    branchName: validateBankTextField(body.branchName, "Branch name", {
      required: requireAll,
      maxLength: 80,
    }),
    ifscCode: validateIfscCode(body.ifscCode, { required: requireAll }),
  };
}

function assertDeliveryDocumentsPresent(fields, { requireAll = false } = {}) {
  const drivingLicenseFront = normalizeOptional(fields.drivingLicenseFront);
  const drivingLicenseBack = normalizeOptional(fields.drivingLicenseBack);
  const aadhaarCardFront = normalizeOptional(fields.aadhaarCardFront);
  const aadhaarCardBack = normalizeOptional(fields.aadhaarCardBack);

  if (!requireAll) return;

  if (!drivingLicenseFront) {
    throw new AppError("Driving license front image is required", 400);
  }
  if (!drivingLicenseBack) {
    throw new AppError("Driving license back image is required", 400);
  }
  if (!aadhaarCardFront) {
    throw new AppError("Aadhaar card front image is required", 400);
  }
  if (!aadhaarCardBack) {
    throw new AppError("Aadhaar card back image is required", 400);
  }
}

module.exports = {
  compactVehicleRegistration,
  validateVehicleRegistration,
  validateLicenseNumber,
  validateVehicleType,
  assertDeliveryVehicleFields,
  assertDeliveryBankFields,
  assertDeliveryDocumentsPresent,
};
