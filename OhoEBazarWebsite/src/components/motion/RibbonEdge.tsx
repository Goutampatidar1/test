import { useId, useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { gsap, useGsap } from "@/lib/gsap";
import { cn } from "@/lib/utils";

const WAVE = "M0,150 C260,70 520,34 800,104 S1230,196 1440,64";
const FILL = `${WAVE} L1440,200 L0,200 Z`;
const TONES = { ivory: "#f5eee3", night: "#0e0b09" } as const;

/**
 * The hero ribbon's landing edge: a silk band riding the wave-shaped top of a section.
 * Sits above its section (bottom-full), so it overlaps whatever scrolls underneath.
 */
export function RibbonEdge({ tone, flip, className }: { tone: keyof typeof TONES; flip?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGsap(
    () => {
      const el = ref.current;
      const section = el?.parentElement;
      if (!el || !section || reduced) return;
      const q = gsap.utils.selector(el);
      // Starts tucked into its own section so it rises over the previous one instead of sitting on its last frame.
      gsap.fromTo(
        el,
        { yPercent: 100 },
        { yPercent: 0, ease: "power1.out", scrollTrigger: { trigger: section, start: "top bottom", end: "top 60%", scrub: 0.4 } },
      );
      gsap.fromTo(
        q("[data-edge-band]"),
        { strokeDashoffset: 1 },
        {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: { trigger: section, start: "top 90%", end: "top 30%", scrub: 0.6 },
        },
      );
      gsap.fromTo(
        q("[data-edge-sheen]"),
        { strokeDashoffset: 0.25 },
        {
          strokeDashoffset: -1,
          ease: "none",
          scrollTrigger: { trigger: section, start: "top 90%", end: "top -10%", scrub: true },
        },
      );
    },
    [reduced],
    ref,
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 bottom-full h-[clamp(4.5rem,11vw,10rem)] translate-y-px", flip && "-scale-x-100", className)}
    >
      <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="size-full overflow-visible">
        <defs>
          <linearGradient id={`${id}-band`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7a2400" />
            <stop offset="0.45" stopColor="#fe7000" />
            <stop offset="0.8" stopColor="#ff9a3c" />
            <stop offset="1" stopColor="#ffc27a" />
          </linearGradient>
        </defs>
        <path d={FILL} fill={TONES[tone]} />
        <path
          data-edge-band
          d={WAVE}
          pathLength={1}
          strokeDasharray="1 1"
          fill="none"
          stroke={`url(#${id}-band)`}
          strokeWidth={14}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          data-edge-sheen
          d={WAVE}
          pathLength={1}
          strokeDasharray="0.12 1"
          fill="none"
          stroke="rgba(255,236,210,0.85)"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          transform="translate(0,-4)"
        />
      </svg>
    </div>
  );
}
