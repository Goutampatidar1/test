import { useId, useRef } from "react";
import { Cutout, RemoteImage } from "@/components/media/Photo";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useI18n } from "@/i18n/LanguageProvider";
import { resolveMediaUrl } from "@/lib/api";
import { gsap, useGsap } from "@/lib/gsap";
import { isPlaceholder } from "@/lib/media";
import type { PublicHotDeal } from "@/lib/types";
import { SectionLabel } from "./SectionLabel";

/** Dark editorial beat. Deals are listed only when the hot-deals API returns live entries. */
export function PromoSection({ hotDeals }: { hotDeals: PublicHotDeal[] }) {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const filterId = `promo-distort-${useId().replace(/:/g, "")}`;
  const deals = hotDeals.filter((d) => d.name || d.title).slice(0, 4);

  useGsap(
    () => {
      const el = ref.current;
      if (!el || reduced) return;
      const q = gsap.utils.selector(el);
      const art = q("[data-promo-art]")[0] as HTMLElement | undefined;
      const map = el.querySelector("feDisplacementMap");
      if (!art || !map) return;

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "center 45%",
          scrub: 0.8,
          onUpdate: (self) => {
            art.style.filter = self.progress >= 0.999 ? "none" : `url(#${filterId})`;
          },
        },
      });
      tl.fromTo(map, { attr: { scale: 220 } }, { attr: { scale: 0 }, ease: "power2.out", duration: 1 }, 0)
        .fromTo(art, { opacity: 0, scale: 1.12, yPercent: 8 }, { opacity: 1, scale: 1, yPercent: 0, ease: "power2.out", duration: 0.8 }, 0)
        .fromTo(q("[data-promo-light]"), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 1 }, 0);

      gsap.fromTo(
        q("[data-promo-drift]"),
        { yPercent: 6 },
        { yPercent: -6, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } },
      );
    },
    [reduced, filterId, lang],
    ref,
  );

  return (
    <section id="promotions" ref={ref} data-nav="dark" aria-labelledby="promo-title" className="relative z-10 overflow-hidden bg-charcoal text-ivory">
      <svg aria-hidden className="absolute size-0">
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.03" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className="frame grid min-h-[100svh] grid-cols-1 items-center gap-y-14 py-24 lg:grid-cols-12 lg:gap-x-6 lg:py-32">
        <div className="relative z-10 lg:col-span-7">
          <SectionLabel index={6} className="text-ivory/50">
            {t.promo.eyebrow}
          </SectionLabel>
          <SplitTextReveal
            id="promo-title"
            lines={t.promo.lines}
            className="mt-7 font-display text-[clamp(2.8rem,6.4vw,6.8rem)] leading-[0.98] tracking-[-0.035em] [html[lang=hi]_&]:text-[clamp(2.5rem,5.6vw,5.9rem)] [html[lang=hi]_&]:leading-[1.2] [html[lang=hi]_&]:tracking-normal"
            accentClassName="text-oho"
          />
          <p className="t-lead mt-8 max-w-[28rem] text-ivory/65">{t.promo.body}</p>

          {deals.length > 0 && (
            <div className="mt-12 max-w-[30rem]">
              <p className="eyebrow text-ember">{t.promo.deals(hotDeals.length)}</p>
              <ul className="mt-3">
                {deals.map((d, i) => {
                  const img = d.image ?? d.thumbnail;
                  const src = !isPlaceholder(img) ? resolveMediaUrl(img) : undefined;
                  return (
                    <li key={d._id ?? i} className="flex items-center gap-4 border-t border-ivory/10 py-3">
                      {src && (
                        <span className="size-12 shrink-0 overflow-hidden rounded-[6px]">
                          <RemoteImage src={src} alt="" />
                        </span>
                      )}
                      <span className="line-clamp-2 font-display text-lg">{d.name ?? d.title}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <figure className="relative lg:col-span-5">
          <div data-promo-drift className="relative aspect-square">
            <div
              data-promo-light
              aria-hidden
              className="absolute inset-[-12%] rounded-full bg-[radial-gradient(circle_at_50%_55%,rgba(254,112,0,0.32),rgba(254,112,0,0.08)_42%,transparent_68%)]"
            />
            <div aria-hidden className="absolute bottom-[17%] left-1/2 h-[7%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/60 blur-2xl" />
            <div data-promo-art className="absolute inset-x-[6%] top-[46%] -translate-y-1/2">
              <Cutout name="saree" alt={t.promo.caption} sizes="(min-width: 1024px) 38vw, 90vw" className="drop-shadow-[0_40px_40px_rgba(0,0,0,0.45)]" />
            </div>
          </div>
          <figcaption className="mt-2 text-right text-xs text-ivory/40">{t.promo.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
