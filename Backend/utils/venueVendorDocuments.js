const { deleteUploadFileByPublicUrl } = require("./deleteUploadFile");
const { publicUploadPathFromFile } = require("./publicUploadPath");

function uploadPathFromFiles(req, field, uploadFolder) {
  const file = req.files?.[field]?.[0];
  if (!file) return undefined;
  return `/uploads/${uploadFolder}/${file.filename}`;
}

function uploadPathFromFieldAliases(req, fields, uploadFolder) {
  for (const field of fields) {
    const path = uploadPathFromFiles(req, field, uploadFolder);
    if (path) return path;
  }
  return undefined;
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function resolveVenueVendorDocumentUploads(req, body = {}, uploadFolder) {
  const aadhaarCardFront =
    uploadPathFromFieldAliases(req, ["aadhaarCardFront", "aadhaarCard"], uploadFolder) ??
    normalizeOptional(body.aadhaarCardFront ?? body.aadhaarCard);
  const aadhaarCardBack =
    uploadPathFromFiles(req, "aadhaarCardBack", uploadFolder) ?? normalizeOptional(body.aadhaarCardBack);
  const panCard = uploadPathFromFiles(req, "panCard", uploadFolder) ?? normalizeOptional(body.panCard);

  return {
    aadhaarCardFront,
    aadhaarCardBack,
    aadhaarCard: aadhaarCardFront,
    panCard,
  };
}

function listVenueVendorUploadedPaths(req, uploadFolder) {
  return [
    uploadPathFromFiles(req, "file", uploadFolder) ?? publicUploadPathFromFile(req, uploadFolder),
    uploadPathFromFieldAliases(req, ["aadhaarCardFront", "aadhaarCard"], uploadFolder),
    uploadPathFromFiles(req, "aadhaarCardBack", uploadFolder),
    uploadPathFromFiles(req, "panCard", uploadFolder),
  ].filter(Boolean);
}

function assignVenueVendorAadhaarFront(venueVendor, nextValue) {
  if (!nextValue) return;
  deleteUploadFileByPublicUrl(venueVendor.aadhaarCardFront);
  deleteUploadFileByPublicUrl(venueVendor.aadhaarCard);
  venueVendor.aadhaarCardFront = nextValue;
  venueVendor.aadhaarCard = nextValue;
}

function assignVenueVendorAadhaarBack(venueVendor, nextValue) {
  if (!nextValue) return;
  deleteUploadFileByPublicUrl(venueVendor.aadhaarCardBack);
  venueVendor.aadhaarCardBack = nextValue;
}

function assignVenueVendorPanCard(venueVendor, nextValue) {
  if (!nextValue) return;
  deleteUploadFileByPublicUrl(venueVendor.panCard);
  venueVendor.panCard = nextValue;
}

module.exports = {
  resolveVenueVendorDocumentUploads,
  listVenueVendorUploadedPaths,
  assignVenueVendorAadhaarFront,
  assignVenueVendorAadhaarBack,
  assignVenueVendorPanCard,
};
