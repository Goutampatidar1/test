/** Same mobile carousel size as admin Banner Management (ecom / user / vendor). */
export const VENDOR_BANNER_SPEC = {
  recommendedWidth: 339,
  recommendedHeight: 128,
  aspectRatio: 2.6,
  aspectTolerance: 0.12,
  minWidth: 280,
  minHeight: 90,
};

export const VENDOR_BANNER_HINT = "Use 339×128 px (2.6:1). Minimum 280×90 px.";

function isAspectRatioValid(width, height, spec = VENDOR_BANNER_SPEC) {
  const ratio = width / height;
  const delta = Math.abs(ratio - spec.aspectRatio) / spec.aspectRatio;
  return delta <= spec.aspectTolerance;
}

export function validateVendorBannerDimensions(width, height) {
  const spec = VENDOR_BANNER_SPEC;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "Could not read image dimensions.";
  }
  if (width < spec.minWidth || height < spec.minHeight) {
    return `Banner must be at least ${spec.minWidth}×${spec.minHeight}px (recommended ${spec.recommendedWidth}×${spec.recommendedHeight}px).`;
  }
  if (!isAspectRatioValid(width, height, spec)) {
    return `Banner aspect ratio should be about ${spec.aspectRatio}:1 (recommended ${spec.recommendedWidth}×${spec.recommendedHeight}px).`;
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

export async function assertVendorBannerFile(file) {
  if (!file) return "";
  const { width, height } = await readImageDimensions(file);
  return validateVendorBannerDimensions(width, height);
}
