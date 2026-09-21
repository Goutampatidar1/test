import {
  sanitizePhoneInput,
  validateEmailMessage,
  validateGstMessage,
  validateIndianMobileMessage,
  validatePanMessage,
} from "./validation.js";

export const NAME_MIN = 2;
export const NAME_MAX = 40;
export const BUSINESS_NAME_MIN = 2;
export const BUSINESS_NAME_MAX = 32;
export const BANK_NAME_MIN = 2;
export const BANK_NAME_MAX = 32;
export const BRANCH_NAME_MIN = 2;
export const BRANCH_NAME_MAX = 64;
export const ADDRESS_MIN = 10;
export const ADDRESS_MAX = 240;
export const ACCOUNT_NO_REGEX = /^\d{9,18}$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_TYPES = ["Current", "Savings"];
export const NAME_REGEX = /^[A-Za-z ]+$/;
export const BANK_NAME_REGEX = /^[A-Za-z ]+$/;
export const BRANCH_NAME_REGEX = /^[A-Za-z ]+$/;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Full QWERTY on mobile — avoids numeric-only keyboard for PAN/GST/IFSC. */
export const ALPHANUMERIC_MOBILE_INPUT_PROPS = {
  type: "text",
  inputMode: "text",
  autoCapitalize: "characters",
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
};

export function sanitizeNameInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z ]+/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, NAME_MAX);
}

export function sanitizeBusinessNameInput(value) {
  return String(value ?? "").slice(0, BUSINESS_NAME_MAX);
}

export function sanitizePanInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 10);
}

export function sanitizeGstInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 15);
}

export function sanitizeBankNameInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z ]+/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, BANK_NAME_MAX);
}

export function sanitizeBranchNameInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z ]+/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, BRANCH_NAME_MAX);
}

export function sanitizeAccountNumberInput(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 18);
}

export function sanitizeIfscInput(value) {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 11);
}

export function validateFullName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "Full name is required.";
  if (trimmed.length < NAME_MIN) return `Full name must be at least ${NAME_MIN} characters.`;
  if (trimmed.length > NAME_MAX) return `Full name cannot exceed ${NAME_MAX} characters.`;
  if (!NAME_REGEX.test(trimmed)) return "Full name should contain only letters and spaces.";
  return "";
}

export function validateBusinessName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "Business name is required.";
  if (trimmed.length < BUSINESS_NAME_MIN) {
    return `Business name must be at least ${BUSINESS_NAME_MIN} characters.`;
  }
  if (trimmed.length > BUSINESS_NAME_MAX) {
    return `Business name cannot exceed ${BUSINESS_NAME_MAX} characters.`;
  }
  return "";
}

export function validateBusinessAddress(address) {
  const trimmed = String(address ?? "").trim();
  if (!trimmed) return "Address is required.";
  if (trimmed.length < ADDRESS_MIN) {
    return `Address must be at least ${ADDRESS_MIN} characters.`;
  }
  if (trimmed.length > ADDRESS_MAX) {
    return `Address cannot exceed ${ADDRESS_MAX} characters.`;
  }
  return "";
}

export function validateBankName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "Bank name is required.";
  if (trimmed.length < BANK_NAME_MIN) {
    return `Bank name must be at least ${BANK_NAME_MIN} characters.`;
  }
  if (trimmed.length > BANK_NAME_MAX) {
    return `Bank name cannot exceed ${BANK_NAME_MAX} characters.`;
  }
  if (!BANK_NAME_REGEX.test(trimmed)) {
    return "Bank name should contain only letters and spaces.";
  }
  return "";
}

export function validateBranchName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "Branch name is required.";
  if (trimmed.length < BRANCH_NAME_MIN) {
    return `Branch name must be at least ${BRANCH_NAME_MIN} characters.`;
  }
  if (trimmed.length > BRANCH_NAME_MAX) {
    return `Branch name cannot exceed ${BRANCH_NAME_MAX} characters.`;
  }
  if (!BRANCH_NAME_REGEX.test(trimmed)) {
    return "Branch name should contain only letters and spaces.";
  }
  return "";
}

export function validateAccountType(accountType) {
  const value = String(accountType ?? "").trim();
  if (!value) return "Account type is required.";
  if (!ACCOUNT_TYPES.includes(value)) return "Select a valid account type.";
  return "";
}

export function validateAccountNumber(accountNumber) {
  const trimmed = String(accountNumber ?? "").trim();
  if (!trimmed) return "Account number is required.";
  if (!ACCOUNT_NO_REGEX.test(trimmed)) {
    return "Enter a valid account number (9–18 digits).";
  }
  return "";
}

export function validateIfscCode(ifscCode) {
  const value = String(ifscCode ?? "").trim().toUpperCase();
  if (!value) return "IFSC code is required.";
  if (!IFSC_REGEX.test(value)) return "Enter a valid IFSC code (e.g. SBIN0001234).";
  return "";
}

export function validateVenueVendorDocuments({
  aadhaarFrontFile,
  aadhaarBackFile,
  existingAadhaarFront = "",
  existingAadhaarBack = "",
  existingAadhaarCard = "",
} = {}) {
  const aadhaarFront = String(existingAadhaarFront || existingAadhaarCard || "").trim();
  const aadhaarBack = String(existingAadhaarBack ?? "").trim();
  if (!aadhaarFrontFile && !aadhaarFront) {
    return "Upload Aadhaar front side.";
  }
  if (!aadhaarBackFile && !aadhaarBack) {
    return "Upload Aadhaar back side.";
  }
  return "";
}

/**
 * Returns the first validation failure as { tab, message } or null.
 */
export function validateVenueVendorForm(form, options = {}) {
  const {
    validateEmail = false,
    aadhaarFrontFile,
    aadhaarBackFile,
    existingAadhaarFront,
    existingAadhaarBack,
    existingAadhaarCard,
  } = options;

  const personalChecks = [
    validateFullName(form.name),
    validateEmail ? validateEmailMessage(form.email, { required: false }) : "",
    validateIndianMobileMessage(form.phone, { required: true, label: "Mobile number" }),
  ];
  for (const message of personalChecks) {
    if (message) return { tab: "personal", message };
  }

  const businessChecks = [
    validateBusinessName(form.businessName),
    validateIndianMobileMessage(form.businessPhone, { required: true, label: "Business mobile number" }),
    validateBusinessAddress(form.businessAddress),
    validatePanMessage(form.panNumber, { required: false }),
    validateGstMessage(form.gstNumber, { required: false }),
  ];
  for (const message of businessChecks) {
    if (message) return { tab: "business", message };
  }

  const bankChecks = [
    validateBankName(form.bankName),
    validateBranchName(form.branchName),
    validateAccountType(form.accountType),
    validateAccountNumber(form.accountNumber),
    validateIfscCode(form.ifscCode),
  ];
  for (const message of bankChecks) {
    if (message) return { tab: "bank", message };
  }

  const documentsError = validateVenueVendorDocuments({
    aadhaarFrontFile,
    aadhaarBackFile,
    existingAadhaarFront,
    existingAadhaarBack,
    existingAadhaarCard,
  });
  if (documentsError) return { tab: "documents", message: documentsError };

  return null;
}

/** Validate only the currently visible profile tab. */
export function validateVenueVendorTab(form, tab, options = {}) {
  const {
    validateEmail = false,
    aadhaarFrontFile,
    aadhaarBackFile,
    existingAadhaarFront,
    existingAadhaarBack,
    existingAadhaarCard,
  } = options;

  const checksByTab = {
    personal: [
      validateFullName(form.name),
      validateEmail ? validateEmailMessage(form.email, { required: false }) : "",
      validateIndianMobileMessage(form.phone, { required: true, label: "Mobile number" }),
    ],
    business: [
      validateBusinessName(form.businessName),
      validateIndianMobileMessage(form.businessPhone, {
        required: true,
        label: "Business mobile number",
      }),
      validateBusinessAddress(form.businessAddress),
      validatePanMessage(form.panNumber, { required: false }),
      validateGstMessage(form.gstNumber, { required: false }),
    ],
    bank: [
      validateBankName(form.bankName),
      validateBranchName(form.branchName),
      validateAccountType(form.accountType),
      validateAccountNumber(form.accountNumber),
      validateIfscCode(form.ifscCode),
    ],
  };

  if (tab === "documents") {
    const message = validateVenueVendorDocuments({
      aadhaarFrontFile,
      aadhaarBackFile,
      existingAadhaarFront,
      existingAadhaarBack,
      existingAadhaarCard,
    });
    return message ? { tab, message } : null;
  }

  const message = (checksByTab[tab] || []).find(Boolean);
  return message ? { tab, message } : null;
}

export { sanitizePhoneInput, validateEmailMessage, validateGstMessage, validateIndianMobileMessage, validatePanMessage };
