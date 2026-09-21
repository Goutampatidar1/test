const { deleteUploadFileByPublicUrl } = require("./deleteUploadFile");
const { publicUploadPathFromFile } = require("./publicUploadPath");

const VENDOR_UPLOAD_DIR = "vendor";

function filesForField(req, field) {
  if (Array.isArray(req.files)) {
    return req.files.filter((f) => f.fieldname === field);
  }
  const entry = req.files?.[field];
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

function uploadPathFromFiles(req, field) {
  const files = filesForField(req, field);
  if (!files.length) return undefined;
  return `/uploads/${VENDOR_UPLOAD_DIR}/${files[0].filename}`;
}

function uploadPathsFromFiles(req, field) {
  return filesForField(req, field).map(
    (f) => `/uploads/${VENDOR_UPLOAD_DIR}/${f.filename}`
  );
}

function uploadPathFromFieldAliases(req, fields) {
  for (const field of fields) {
    const path = uploadPathFromFiles(req, field);
    if (path) return path;
  }
  return undefined;
}

function uploadPathsFromFieldAliases(req, fields) {
  return fields.flatMap((field) => uploadPathsFromFiles(req, field));
}

function parseStringArrayField(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return [];
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function uploadedVendorPaths(req) {
  if (Array.isArray(req.files) && req.files.length) {
    return req.files.map((f) => `/uploads/${VENDOR_UPLOAD_DIR}/${f.filename}`);
  }
  return [
    uploadPathFromFiles(req, "file") ??
      uploadPathFromFiles(req, "profile_image") ??
      uploadPathFromFiles(req, "profileImage") ??
      publicUploadPathFromFile(req, VENDOR_UPLOAD_DIR),
    uploadPathFromFiles(req, "aadhaarCard"),
    uploadPathFromFiles(req, "aadhaarCardFront"),
    uploadPathFromFiles(req, "aadhaarCardBack"),
    uploadPathFromFiles(req, "panCard"),
    uploadPathFromFiles(req, "panCardFront"),
    uploadPathFromFiles(req, "shopLogo"),
    ...uploadPathsFromFiles(req, "shopImages"),
    ...uploadPathsFromFieldAliases(req, ["shop_banner_Images", "shop_banner_images"]),
    ...uploadPathsFromFiles(req, "shopVideos"),
    uploadPathFromFiles(req, "shopBanner"),
  ].filter(Boolean);
}

function cleanupUploadedVendorFiles(req) {
  uploadedVendorPaths(req).forEach((u) => deleteUploadFileByPublicUrl(u));
}

module.exports = {
  VENDOR_UPLOAD_DIR,
  filesForField,
  uploadPathFromFiles,
  uploadPathsFromFiles,
  uploadPathFromFieldAliases,
  uploadPathsFromFieldAliases,
  parseStringArrayField,
  uploadedVendorPaths,
  cleanupUploadedVendorFiles,
};
