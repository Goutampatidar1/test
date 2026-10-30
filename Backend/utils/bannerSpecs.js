const ALLOWED_TARGET_TYPES = new Set(["ecom", "venue", "user"]);
const ALLOWED_RELATED_TYPES = new Set(["none", "category", "product", "vendor"]);

/** Shared mobile carousel size — admin, ecom vendor, and venue vendor banners. */
const MOBILE_BANNER_SPEC = {
  recommendedWidth: 339,
  recommendedHeight: 128,
  aspectRatio: 2.6,
  aspectTolerance: 0.12,
  minWidth: 280,
  minHeight: 90,
};

const BANNER_SPECS = {
  ecom: {
    label: "E-commerce",
    ...MOBILE_BANNER_SPEC,
  },
  venue: {
    label: "Service vendor",
    ...MOBILE_BANNER_SPEC,
  },
  user: {
    label: "User app",
    ...MOBILE_BANNER_SPEC,
  },
};

function normalizeRelatedType(value) {
  const normalized = String(value ?? "none").trim().toLowerCase();
  return ALLOWED_RELATED_TYPES.has(normalized) ? normalized : null;
}

function normalizeTargetType(value) {
  const normalized = String(value ?? "ecom").trim().toLowerCase();
  return ALLOWED_TARGET_TYPES.has(normalized) ? normalized : null;
}

function isAspectRatioValid(width, height, spec) {
  if (!width || !height) return false;
  const ratio = width / height;
  const delta = Math.abs(ratio - spec.aspectRatio) / spec.aspectRatio;
  return delta <= spec.aspectTolerance;
}

function validateBannerDimensions(targetType, width, height) {
  const type = normalizeTargetType(targetType) || "ecom";
  const spec = BANNER_SPECS[type] || BANNER_SPECS.ecom;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "Could not read image dimensions.";
  }
  if (width < spec.minWidth || height < spec.minHeight) {
    return `${spec.label} banner must be at least ${spec.minWidth}×${spec.minHeight}px (recommended ${spec.recommendedWidth}×${spec.recommendedHeight}px).`;
  }
  if (!isAspectRatioValid(width, height, spec)) {
    return `${spec.label} banner aspect ratio should be about ${spec.aspectRatio}:1 (recommended ${spec.recommendedWidth}×${spec.recommendedHeight}px).`;
  }
  return "";
}

/**
 * Validate a multer file / disk path against banner pixel rules.
 * Soft-skips when sharp cannot read the file (dev without native binary).
 */
async function assertBannerUploadDimensions(fileOrPath, targetType = "ecom") {
  if (!fileOrPath) return;
  const { inspectImageFile } = require("./imageNormalize");
  const AppError = require("./AppError");
  const meta = await inspectImageFile(fileOrPath);
  if (!meta) return;
  const message = validateBannerDimensions(targetType, meta.width, meta.height);
  if (message) throw new AppError(message, 400);
}

module.exports = {
  ALLOWED_TARGET_TYPES,
  ALLOWED_RELATED_TYPES,
  BANNER_SPECS,
  MOBILE_BANNER_SPEC,
  normalizeTargetType,
  normalizeRelatedType,
  validateBannerDimensions,
  assertBannerUploadDimensions,
};
