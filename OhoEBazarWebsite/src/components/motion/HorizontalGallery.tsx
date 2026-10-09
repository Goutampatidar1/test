import { useRef, type ReactNode } from "react";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { gsap, useGsap } from "@/lib/gsap";
import { cn } from "@/lib/utils";

type HorizontalGalleryProps = {
  children: ReactNode;
  label: string;
  className?: string;
  trackClassName?: string;
  /** Rendered above the track inside the pinned frame (desktop) or before it (mobile). */
  overlay?: ReactNode;
  onProgress?: (progress: number) => void;
  /** Re-measure when content changes (e.g. API data arrives). */
  deps?: unknown[];
};

/**
 * Desktop: pins the section and converts vertical scroll into horizontal travel. Children can opt into
 * travel-linked effects with `data-hg-reveal` (clip wipe), `data-hg-parallax="<percent>"` and `data-hg-text`.
 * Touch / small screens / reduced motion: a native swipeable, snap-aligned strip.
 */
export function HorizontalGallery({
  children,
  label,
  className,
  trackClassName,
  overlay,
  onProgress,
  deps = [],
}: HorizontalGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const pinned = desktop && !reduced;
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useGsap(
    () => {
      const root = rootRef.current;
      const track = trackRef.current;
      if (!pinned || !root || !track) return;

      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const travel = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => progressRef.current?.(self.progress),
        },
      });

      track.querySelectorAll<HTMLElement>("[data-hg-reveal]").forEach((el) => {
        gsap.fromTo(
          el,
          { clipPath: "inset(0% 100% 0% 0% round 28px)" },
          {
            clipPath: "inset(0% 0% 0% 0% round 28px)",
            ease: "none",
            scrollTrigger: { trigger: el, containerAnimation: travel, start: "left 100%", end: "left 45%", scrub: true },
          },
        );
      });

      track.querySelectorAll<HTMLElement>("[data-hg-parallax]").forEach((el) => {
        const amount = Number(el.dataset.hgParallax) || 12;
        gsap.fromTo(
          el,
          { xPercent: -amount },
          {
            xPercent: amount,
            ease: "none",
            scrollTrigger: { trigger: el, containerAnimation: travel, start: "left right", end: "right left", scrub: true },
          },
        );
      });

      track.querySelectorAll<HTMLElement>("[data-hg-text]").forEach((el) => {
        gsap.from(el, {
          y: 50,
          opacity: 0,
          duration: 1,
          ease: "expo.out",
          scrollTrigger: { trigger: el, containerAnimation: travel, start: "left 85%", toggleActions: "play none none reverse" },
        });
      });
    },
    [pinned, ...deps],
    rootRef,
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className={cn("relative", pinned && "flex h-[100svh] flex-col justify-center overflow-hidden")}>
        {overlay}
        <div
          ref={trackRef}
          role="region"
          aria-label={label}
          tabIndex={0}
          className={cn(
            "flex gap-5 outline-none",
            pinned
              ? "w-max flex-nowrap items-center will-change-transform"
              : "pointer-coarse:no-scrollbar snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-px-5 px-5 pb-6 [&>*]:snap-start",
            trackClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
