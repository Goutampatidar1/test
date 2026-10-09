import { useId } from "react";
import { cn } from "@/lib/utils";

/** The OHO bag mark — SVG glyph used as a small decorative icon (e.g. hero eyebrow). */
export function BrandGlyph({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd54a" />
          <stop offset="100%" stopColor="#ff8a00" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#141414" />
      <rect data-glyph-body x="6" y="8" width="16" height="16" rx="3" fill={`url(#${id})`} />
      <path data-glyph-flap d="M22 11h5v13a2 2 0 0 1-2 2h-3V11z" fill="#ffd54a" />
      <circle data-glyph-o cx="13.8" cy="16.6" r="3.1" fill="none" stroke="#141414" strokeWidth="2.1" />
    </svg>
  );
}

type BrandLogoProps = {
  className?: string;
  /** Height of the logo image. Defaults to `h-8`. */
  height?: string;
};

/**
 * Full OHO E-Bazar logo image (oho-logo.png).
 * The PNG has a white background, so this component wraps it in a white
 * pill — looks intentional on any background colour.
 */
export function BrandLogo({ className, height = "h-8" }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center overflow-hidden rounded-xl bg-white px-2 py-1",
        className,
      )}
    >
      <img
        src="/oho-logo.png"
        alt="OHO E-Bazar"
        className={cn("w-auto object-contain", height)}
        draggable={false}
      />
    </span>
  );
}

type BrandMarkProps = {
  className?: string;
  /** Wordmark colour scheme. */
  tone?: "dark" | "light";
  label: string;
};

/** Legacy BrandMark — used in Footer. Renders the actual logo image. */
export function BrandMark({ className }: BrandMarkProps) {
  return <BrandLogo className={className} height="h-9" />;
}
