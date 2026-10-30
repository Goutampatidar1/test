export const BANNER_SPECS = {
  ecom: {
    label: "E-commerce vendor",
    recommendedWidth: 339,
    recommendedHeight: 128,
    aspectRatio: 2.6,
    aspectTolerance: 0.12,
    minWidth: 280,
    minHeight: 90,
    previewStyle: { width: 339, height: 128 },
  },
  venue: {
    label: "Service vendor",
    recommendedWidth: 339,
    recommendedHeight: 128,
    aspectRatio: 2.6,
    aspectTolerance: 0.12,
    minWidth: 280,
    minHeight: 90,
    previewStyle: { width: 339, height: 128 },
  },
  user: {
    label: "User",
    recommendedWidth: 339,
    recommendedHeight: 128,
    aspectRatio: 2.6,
    aspectTolerance: 0.12,
    minWidth: 280,
    minHeight: 90,
    previewStyle: { width: 339, height: 128 },
  },
};

export const BANNER_RELATED_OPTIONS = [
  { value: "none", label: "Default (none)" },
  { value: "category", label: "Category" },
  { value: "product", label: "Product" },
  { value: "vendor", label: "Vendor" },
];

function isAspectRatioValid(width, height, spec) {
  const ratio = width / height;
  const delta = Math.abs(ratio - spec.aspectRatio) / spec.aspectRatio;
  return delta <= spec.aspectTolerance;
}

export function validateBannerImageDimensions(targetType, width, height) {
  const spec = BANNER_SPECS[targetType] || BANNER_SPECS.ecom;
  if (!spec) return "Please select a valid banner type.";
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

export function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions."));
    };
    img.src = url;
  });
}

export function bannerTargetLabel(targetType) {
  return BANNER_SPECS[targetType]?.label ?? targetType ?? "—";
}

export function bannerRelatedLabel(related) {
  return BANNER_RELATED_OPTIONS.find((o) => o.value === related)?.label ?? related ?? "—";
}

export function bannerImageHint(targetType) {
  void targetType;
  return "Use 339×128 px (2.6:1). Minimum 280×90 px.";
}
