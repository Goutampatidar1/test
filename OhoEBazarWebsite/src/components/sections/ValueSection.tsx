import { useRef } from "react";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatIndex } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LanguageProvider";
import { gsap, useGsap } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

/** Platform capabilities — editorial chapter-number layout. */
export function ValueSection() {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  useGsap(
    () => {
      const el = ref.current;
      if (!el || reduced) return;
      el.querySelectorAll<HTMLElement>("[data-value-item]").forEach((item) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: item, start: "top 87%", once: true } });
        tl.fromTo(item.querySelector("[data-value-rule]"), { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "expo.out" }, 0)
          .fromTo(item.querySelector("[data-value-num]"), { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 1.1, ease: "expo.out" }, 0.04)
          .fromTo(item.querySelectorAll("[data-value-text]"), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.0, stagger: 0.1, ease: "expo.out" }, 0.08);
      });
    },
    [reduced, lang],
    ref,
  );

  return (
    <section ref={ref} id="value" data-nav="light" aria-labelledby="value-title" className="relative z-10 bg-ivory text-charcoal">
      {/* Section header */}
      <div className="frame pb-16 pt-24 lg:pb-20 lg:pt-36">
        <SectionLabel index={8} className="text-smoke">
          {t.value.eyebrow}
        </SectionLabel>
        <SplitTextReveal id="value-title" lines={t.value.lines} className="t-display mt-5 max-w-[22ch]" />
      </div>

      {/* Capability items */}
      <div className="pb-24 lg:pb-40">
        {t.value.items.map((item, i) => (
          <article key={item.title} data-value-item className="relative">
            {/* Animated top rule */}
            <span data-value-rule aria-hidden className="absolute inset-x-0 top-0 h-px origin-left bg-charcoal/10" />

            <div
              className={cn(
                "frame grid grid-cols-[auto_1fr] items-start gap-x-5 py-11",
                "lg:grid-cols-[8rem_1fr_7rem] lg:gap-x-8 lg:py-14",
                // Alternating indent creates a staircase rhythm on desktop
                i % 2 === 1 && "lg:pl-[10vw]",
              )}
            >
              {/* Large decorative chapter number */}
              <span
                data-value-num
                aria-hidden
                className="select-none pt-1 font-display tabular-nums leading-none text-[clamp(2.6rem,6vw,6rem)] text-oho/18"
              >
                {formatIndex(i + 1, lang)}
              </span>

              {/* Title and body */}
              <div className="min-w-0">
                <h3 data-value-text className="font-display text-[clamp(1.6rem,2.7vw,2.7rem)] leading-[1.1]">
                  {item.title}
                </h3>
                <p data-value-text className="t-lead mt-4 max-w-[38ch] text-smoke">
                  {item.body}
                </p>
              </div>

              {/* Fraction counter — editorial accent, desktop only */}
              <div data-value-text className="hidden pt-1 text-right font-display leading-relaxed text-[0.75rem] text-smoke/45 lg:block">
                {formatIndex(i + 1, lang)}
                <span className="mx-1 opacity-50">/</span>
                {formatIndex(t.value.items.length, lang)}
              </div>
            </div>
          </article>
        ))}
        {/* Closing rule */}
        <div aria-hidden className="border-t border-charcoal/10" />
      </div>
    </section>
  );
}
