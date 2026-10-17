import { cn } from "@/lib/utils";

/** Shopping-bag mark from the official logo — small decorative icon (e.g. hero eyebrow). */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#141414" />
      <path
        data-glyph-body
        d="M8 12h16l-1.4 14.2a2.4 2.4 0 0 1-2.4 2.1H11.8a2.4 2.4 0 0 1-2.4-2.1L8 12z"
        fill="none"
        stroke="#ff8a00"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        data-glyph-flap
        d="M12 12c0-3.6 1.8-6.2 4-6.2s4 2.6 4 6.2"
        fill="none"
        stroke="#ffd54a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle data-glyph-o cx="13.2" cy="19.2" r="1.35" fill="#d4e157" />
      <circle cx="18.8" cy="19.2" r="1.35" fill="#d4e157" />
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
 *   "xl"  → h-16 (64 px) — intro loader
 */
type BrandLogoSize = "sm" | "md" | "lg" | "xl";

const SIZE: Record<BrandLogoSize, { wrap: string; img: string }> = {
  sm: { wrap: "h-7  px-1.5 rounded-lg",  img: "h-5" },
  md: { wrap: "h-9  px-2   rounded-[10px]", img: "h-6" },
  lg: { wrap: "h-11 px-3   rounded-xl",  img: "h-7" },
  xl: { wrap: "h-16 px-4   rounded-2xl", img: "h-10" },
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
