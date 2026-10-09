import { useRef } from "react";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatIndex } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LanguageProvider";
import { gsap, useGsap } from "@/lib/gsap";
import { SectionLabel } from "./SectionLabel";

/** Plain statements of what the platform does; no counts, badges or testimonials. */
export function ValueSection() {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  useGsap(
    () => {
      const el = ref.current;
      if (!el || reduced) return;
      el.querySelectorAll<HTMLElement>("[data-value-row]").forEach((row) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 88%", once: true } });
        tl.fromTo(row.querySelector("[data-value-rule]"), { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: "expo.out" }, 0).fromTo(
          row.querySelectorAll("[data-value-text]"),
          { opacity: 0, y: 26 },
          { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: "expo.out" },
          0.1,
        );
      });
    },
    [reduced, lang],
    ref,
  );

  return (
    <section ref={ref} id="value" data-nav="light" aria-labelledby="value-title" className="relative z-10 bg-ivory text-charcoal">
      <div className="frame grid grid-cols-1 gap-y-12 py-24 lg:grid-cols-12 lg:gap-x-6 lg:py-40">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            <SectionLabel index={8} className="text-smoke">
              {t.value.eyebrow}
            </SectionLabel>
            <SplitTextReveal id="value-title" lines={t.value.lines} className="t-title mt-5" />
          </div>
        </div>
        <ol className="lg:col-span-7 lg:col-start-6">
          {t.value.items.map((item, i) => (
            <li key={item.title} data-value-row className="relative grid grid-cols-[3.5rem_1fr] gap-x-4 py-8 sm:grid-cols-[5rem_1fr_1fr] sm:gap-x-8 lg:py-10">
              <span data-value-rule aria-hidden className="absolute inset-x-0 top-0 h-px origin-left bg-charcoal/15" />
              <span data-value-text className="font-display text-lg text-oho">
                {formatIndex(i + 1, lang)}
              </span>
              <h3 data-value-text className="font-display text-[clamp(1.5rem,2.2vw,2.1rem)] leading-[1.15]">
                {item.title}
              </h3>
              <p data-value-text className="col-start-2 mt-2 text-smoke sm:col-start-3 sm:mt-1.5">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
