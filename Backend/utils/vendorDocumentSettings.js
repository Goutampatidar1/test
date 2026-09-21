const { AppConfig } = require("../models");
const AppError = require("./AppError");

const VENDOR_DOCUMENT_TYPES = {
  AADHAR: "Aadhar Card",
  PAN: "Pan Card",
  BANK: "Bank Details",
};

const DEFAULT_DOCUMENT_ROWS = [
  { type: VENDOR_DOCUMENT_TYPES.AADHAR, isActive: true },
  { type: VENDOR_DOCUMENT_TYPES.PAN, isActive: true },
  { type: VENDOR_DOCUMENT_TYPES.BANK, isActive: true },
];

function documentKeyForType(type) {
  if (type === VENDOR_DOCUMENT_TYPES.AADHAR) return "aadhar_card";
  if (type === VENDOR_DOCUMENT_TYPES.PAN) return "pan_card";
  return "bank_details";
}

function isDocumentTypeActive(documents, type) {
  const rows = Array.isArray(documents) && documents.length ? documents : DEFAULT_DOCUMENT_ROWS;
  const row = rows.find((entry) => entry && entry.type === type);
  return row ? !!row.isActive : true;
}

function resolveVendorDocumentSettings(documents) {
  return {
    aadharCard: isDocumentTypeActive(documents, VENDOR_DOCUMENT_TYPES.AADHAR),
    panCard: isDocumentTypeActive(documents, VENDOR_DOCUMENT_TYPES.PAN),
    bankDetails: isDocumentTypeActive(documents, VENDOR_DOCUMENT_TYPES.BANK),
  };
}

async function loadVendorDocumentSettings() {
  const config = await AppConfig.findOne().select("documents").lean();
  return resolveVendorDocumentSettings(config?.documents);
}

function toPublicVendorDocuments(documents) {
  const rows = Array.isArray(documents) && documents.length ? documents : DEFAULT_DOCUMENT_ROWS;
  return rows.map((row) => ({
    type: row.type,
    isActive: !!row.isActive,
    key: documentKeyForType(row.type),
  }));
}

function assertVendorProfileDocuments(settings, vendor) {
  if (settings.aadharCard && !vendor.aadhaarCardFront) {
    throw new AppError("Aadhaar card image is required", 400);
  }
  if (settings.bankDetails) {
    const hasBank =
      String(vendor.bankName || "").trim() &&
      String(vendor.accountNo || "").trim() &&
      String(vendor.ifsc || "").trim();
    if (!hasBank) {
      throw new AppError("Bank details are required", 400);
    }
  }
}

module.exports = {
  VENDOR_DOCUMENT_TYPES,
  loadVendorDocumentSettings,
  resolveVendorDocumentSettings,
  toPublicVendorDocuments,
  assertVendorProfileDocuments,
};
