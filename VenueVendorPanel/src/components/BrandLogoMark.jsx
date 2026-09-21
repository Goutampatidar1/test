import { useEffect, useState } from "react";
import { mediaUrl } from "../media.js";

function BrandLogoSvg({ size = 40 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="vendorBrandGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd54a" />
          <stop offset="100%" stopColor="#ff8a00" />
        </linearGradient>
      </defs>
      <rect x="4" y="6" width="18" height="20" rx="3" fill="url(#vendorBrandGrad)" />
      <path d="M22 10h6v16a2 2 0 0 1-2 2h-4V10z" fill="#1a1a1a" opacity="0.85" />
    </svg>
  );
}

export function BrandLogoMark({ logoPath, size = 40, className = "", imgClassName = "", fill = false }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logoSrc = mediaUrl(logoPath);
  const showImage = Boolean(logoSrc) && !imgFailed;

  useEffect(() => {
    setImgFailed(false);
  }, [logoSrc]);

  return (
    <span className={`vendor-brand-mark${fill ? " vendor-brand-mark--fill" : ""} ${className}`.trim()} aria-hidden="true">
      {showImage ? (
        <img
          src={logoSrc}
          alt=""
          className={imgClassName}
          width={fill ? undefined : size}
          height={fill ? undefined : size}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <BrandLogoSvg size={size} />
      )}
    </span>
  );
}
