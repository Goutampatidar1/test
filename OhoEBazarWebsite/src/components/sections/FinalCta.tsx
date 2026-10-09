import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useId, useRef, type MouseEvent } from "react";
import { useSmoothScroll } from "@/components/layout/SmoothScroll";
import { Cutout } from "@/components/media/Photo";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { RibbonEdge } from "@/components/motion/RibbonEdge";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useI18n } from "@/i18n/LanguageProvider";
import { VENDOR_PANEL_URL } from "@/lib/api";
import { gsap, useGsap } from "@/lib/gsap";

const FLOW = "M-80,620 C220,520 360,240 640,300 S1040,620 1240,420 S1480,120 1540,180";

export function FinalCta() {
  const { t } = useI18n();
  const { scrollTo } = useSmoothScroll();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const gradientId = `cta-flow-${useId().replace(/:/g, "")}`;

  useGsap(
    () => {
      const el = ref.current;
      if (!el || reduced) return;
      const q = gsap.utils.selector(el);
      gsap.fromTo(
        q("[data-cta-flow]"),
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: el, start: "top 85%", end: "center center", scrub: 0.8 } },
      );
      gsap.to(q("[data-cta-sheen]"), { strokeDashoffset: -1, duration: 9, ease: "none", repeat: -1 });
      gsap.fromTo(
        q("[data-cta-lantern]"),
        { yPercent: -18 },
        { yPercent: 0, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "center center", scrub: true } },
      );
      gsap.fromTo(
        q("[data-cta-gift]"),
        { yPercent: 24, rotate: 6 },
        { yPercent: 0, rotate: -3, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom bottom", scrub: true } },
      );
      gsap.to(q("[data-cta-sway]"), { rotate: 2.5, duration: 3.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
    },
    [reduced],
    ref,
  );

  const browse = (e: MouseEvent) => {
    e.preventDefault();
    scrollTo("#categories");
  };

  return (
    <section id="discover" data-nav="dark" aria-labelledby="cta-title" className="relative z-10 bg-night text-ivory">
      <RibbonEdge tone="night" flip />
      <div ref={ref} className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[55%] aspect-square w-[64vw] max-w-[1000px] -translate-x-1/2 -translate-y-1/2">
            <div className="size-full animate-glow rounded-full bg-[radial-gradient(circle,rgba(254,112,0,0.22),rgba(254,112,0,0.05)_45%,transparent_68%)]" />
          </div>
          <svg viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="1">
                <stop offset="0" stopColor="#7a2400" stopOpacity="0" />
                <stop offset="0.3" stopColor="#c75400" />
                <stop offset="0.7" stopColor="#fe7000" />
                <stop offset="1" stopColor="#ffc27a" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <path data-cta-flow d={FLOW} pathLength={1} strokeDasharray="1 1" fill="none" stroke={`url(#${gradientId})`} strokeWidth={22} strokeLinecap="round" opacity={0.55} />
            <path data-cta-sheen d={FLOW} pathLength={1} strokeDasharray="0.08 0.92" fill="none" stroke="rgba(255,226,190,0.6)" strokeWidth={2} strokeLinecap="round" transform="translate(0,-7)" />
          </svg>
        </div>

        <div data-cta-lantern className="pointer-events-none absolute left-[7vw] top-0 hidden w-[8.5vw] max-w-[8rem] sm:block">
          <div data-cta-sway className="origin-top">
            <span aria-hidden className="mx-auto block h-[14vh] w-px bg-gradient-to-b from-transparent to-brass/70" />
            <div className="relative">
              <span aria-hidden className="absolute left-1/2 top-[62%] size-[160%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,170,80,0.35),transparent_65%)]" />
              <Cutout name="brass-lantern" alt="" sizes="9vw" className="relative" />
            </div>
          </div>
        </div>

        <div className="frame relative flex min-h-[100svh] flex-col items-center justify-center pb-24 pt-36 text-center">
          <SplitTextReveal id="cta-title" lines={t.cta.lines} className="t-mega max-w-[14ch] [html[lang=hi]_&]:max-w-[13ch]" accentClassName="text-oho" />
          <p className="t-lead mt-8 max-w-[32rem] text-ivory/65">{t.cta.body}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <MagneticButton href="#categories" onClick={browse} icon={<ArrowRight className="size-4" />}>
              {t.cta.primary}
            </MagneticButton>
            <MagneticButton href={`${VENDOR_PANEL_URL}/vendor/register`} target="_blank" rel="noopener" variant="ghost" icon={<ArrowUpRight className="size-4" />}>
              {t.cta.secondary}
            </MagneticButton>
          </div>

          <div data-cta-gift className="pointer-events-none relative mt-14 w-[46vw] max-w-[15rem] lg:absolute lg:bottom-[10vh] lg:right-[7vw] lg:mt-0 lg:w-[17vw] lg:max-w-[17rem]">
            <span aria-hidden className="absolute -bottom-[4%] left-1/2 h-[12%] w-[80%] -translate-x-1/2 rounded-[50%] bg-black/70 blur-xl" />
            <Cutout name="gift" alt="" sizes="(min-width: 1024px) 17vw, 46vw" className="relative drop-shadow-[0_24px_30px_rgba(0,0,0,0.5)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
