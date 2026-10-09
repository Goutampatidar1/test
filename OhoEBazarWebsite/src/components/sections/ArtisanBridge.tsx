import { useRef } from "react";
import { Photo } from "@/components/media/Photo";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useI18n } from "@/i18n/LanguageProvider";
import { gsap, useGsap } from "@/lib/gsap";

/**
 * Scene F — cinematic bridge between products and artisans.
 *
 * Desktop: a framed rectangular window clips from an inset card to full-bleed,
 * mimicking an architectural frame opening into the next scene. Text reveals after.
 * Mobile: simple parallax + fade-in, no clip-path (performance + visual clarity).
 */
export function ArtisanBridge() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const desktop = useIsDesktop();
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      const el = ref.current;
      if (!el || reduced) return;
      const q = gsap.utils.selector(el);

      if (desktop) {
        // Frame expands: inset card → full-bleed (scrub with scroll)
        gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: el, start: "top 82%", end: "top 6%", scrub: 0.65 },
        })
          .fromTo(
            q("[data-bridge-frame]"),
            { clipPath: "inset(7vh 3.5rem 7vh 3.5rem round 20px)" },
            { clipPath: "inset(0vh 0rem 0vh 0rem round 0px)", ease: "power3.inOut" },
            0,
          )
          .fromTo(q("[data-bridge-photo]"), { scale: 1.1 }, { scale: 1, ease: "power2.out" }, 0)
          .fromTo(q("[data-bridge-shade]"), { opacity: 0.25 }, { opacity: 1, ease: "none" }, 0.15);
      }

      // Parallax drift — all devices
      gsap.fromTo(
        q("[data-bridge-photo]"),
        { yPercent: 7 },
        {
          yPercent: -7,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.35 },
        },
      );

      // Accent line draws in from left
      gsap.fromTo(
        q("[data-bridge-rule]"),
        { scaleX: 0, opacity: 0 },
        {
          scaleX: 1,
          opacity: 1,
          duration: 1.3,
          ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 50%", toggleActions: "play none none reverse" },
        },
      );

      // Copy — only <p> tags; the rule is handled separately above
      gsap.fromTo(
        q("[data-bridge-copy] > p"),
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 1.1,
          stagger: 0.18,
          ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 47%", toggleActions: "play none none reverse" },
        },
      );
    },
    [reduced, desktop],
    ref,
  );

  return (
    <div
      ref={ref}
      className="relative z-10 overflow-hidden bg-sand"
      style={{ height: "clamp(360px, 68vh, 740px)" }}
    >
      {/* Photo layer — clips from inset card to full-bleed on desktop */}
      <div
        data-bridge-frame
        className="absolute inset-0 overflow-hidden will-change-[clip-path]"
      >
        {/* Parallax room: 18% taller than container, centred */}
        <div
          data-bridge-photo
          className="absolute inset-x-0 h-[118%]"
          style={{ top: "-9%" }}
        >
          <Photo
            name="silk-weaving"
            alt="Silk weaving artisan at work"
            sizes="100vw"
            className="object-[50%_38%]"
          />
        </div>

        {/* Layered gradient: very light at top, dark vignette from 65% for copy contrast */}
        <div
          data-bridge-shade
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              "linear-gradient(180deg,",
              "  rgba(21,19,17,0.10) 0%,",
              "  rgba(21,19,17,0.00) 18%,",
              "  rgba(21,19,17,0.72) 70%,",
              "  rgba(21,19,17,0.20) 100%",
              ")",
            ].join(""),
          }}
        />
      </div>

      {/* Sand edge gradients — always on top of the clip, smooth colour join to neighbours */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(180deg,#e9dcc8 0%,rgba(233,220,200,0) 12%,rgba(233,220,200,0) 86%,#e9dcc8 100%)",
        }}
      />

      {/* Quote block — sits above both clip and edge gradients */}
      <div
        data-bridge-copy
        className="frame absolute inset-x-0 bottom-0 z-20 flex flex-col pb-[9vh] pt-8 sm:pb-[8vh]"
      >
        <p className="eyebrow mb-4 text-ivory/70">{t.people.eyebrow}</p>
        <span
          data-bridge-rule
          aria-hidden
          className="mb-5 block h-[2px] w-12 origin-left bg-ember sm:w-20"
        />
        <p className="font-display text-[clamp(1.6rem,4vw,3.2rem)] leading-[1.1] text-ivory max-w-[28ch] [html[lang=hi]_&]:leading-[1.35]">
          {t.bridge.quote}
        </p>
      </div>
    </div>
  );
}
