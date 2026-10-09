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

/**
 * Full OHO E-Bazar logo image (oho-logo.png).
 *
 * The PNG has a white background so this component wraps it in a tight
 * white rounded container — this looks intentional on any background
 * (dark header, dark footer, light section).
 *
 * `size`:
 *   "sm"  → h-7  (28 px) — compact use, e.g. mobile menu header
 *   "md"  → h-9  (36 px) — desktop navbar  (default)
 *   "lg"  → h-11 (44 px) — footer brand block
 */
type BrandLogoSize = "sm" | "md" | "lg";

const SIZE: Record<BrandLogoSize, { wrap: string; img: string }> = {
  sm: { wrap: "h-7  px-1.5 rounded-lg",  img: "h-5" },
  md: { wrap: "h-9  px-2   rounded-[10px]", img: "h-6" },
  lg: { wrap: "h-11 px-3   rounded-xl",  img: "h-7" },
};

export function BrandLogo({
  className,
  size = "md",
}: {
  className?: string;
  size?: BrandLogoSize;
}) {
  const s = SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center bg-white shadow-sm ring-1 ring-black/[.07]",
        s.wrap,
        className,
      )}
    >
      <img
        src="/oho-logo.png"
        alt="OHO E-Bazar"
        className={cn("w-auto object-contain", s.img)}
        draggable={false}
      />
    </span>
  );
}

type BrandMarkProps = {
  className?: string;
  tone?: "dark" | "light";
  label: string;
};

/** Used in Footer — renders the actual logo image at lg size. */
export function BrandMark({ className }: BrandMarkProps) {
  return <BrandLogo size="lg" className={className} />;
}
