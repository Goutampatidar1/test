import { useId } from "react";
import { cn } from "@/lib/utils";

/** The OHO bag mark used across the admin and vendor panels' favicon. */
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

type BrandMarkProps = {
  className?: string;
  /** Wordmark colour scheme. */
  tone?: "dark" | "light";
  label: string;
};

export function BrandMark({ className, tone = "dark", label }: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandGlyph className="size-9" />
      <span
        className={cn(
          "font-display text-[1.15rem] font-semibold leading-none tracking-tight",
          tone === "dark" ? "text-charcoal" : "text-ivory",
        )}
      >
        {label}
      </span>
    </span>
  );
}
