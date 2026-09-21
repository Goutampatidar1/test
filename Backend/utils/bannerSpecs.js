const ALLOWED_TARGET_TYPES = new Set(["ecom", "venue", "user"]);
const ALLOWED_RELATED_TYPES = new Set(["none", "category", "product", "vendor"]);

const BANNER_SPECS = {
  ecom: {
    label: "E-commerce",
    recommendedWidth: 339,
    recommendedHeight: 128,
    aspectRatio: 2.6,
    aspectTolerance: 0.12,
    minWidth: 280,
    minHeight: 90,
  },
  venue: {
    label: "Venue vendor web",
    recommendedWidth: 1200,
    recommendedHeight: 400,
    aspectRatio: 3,
    aspectTolerance: 0.2,
    minWidth: 800,
    minHeight: 200,
  },
  user: {
    label: "User app",
    recommendedWidth: 339,
    recommendedHeight: 128,
    aspectRatio: 2.6,
    aspectTolerance: 0.12,
    minWidth: 280,
    minHeight: 90,
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
  const type = normalizeTargetType(targetType);
  if (!type) return "Invalid banner target type.";
  const spec = BANNER_SPECS[type];
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

module.exports = {
  ALLOWED_TARGET_TYPES,
  ALLOWED_RELATED_TYPES,
  BANNER_SPECS,
  normalizeTargetType,
  normalizeRelatedType,
  validateBannerDimensions,
};
