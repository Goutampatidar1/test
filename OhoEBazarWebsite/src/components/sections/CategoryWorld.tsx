import { useMemo, useRef } from "react";
import { Cutout, Photo, RemoteImage } from "@/components/media/Photo";
import { RibbonEdge } from "@/components/motion/RibbonEdge";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatIndex } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LanguageProvider";
import { resolveMediaUrl } from "@/lib/api";
import { gsap, useGsap } from "@/lib/gsap";
import { categoryArt, isPlaceholder, sortCategories, type CategoryArt } from "@/lib/media";
import type { PublicCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

/** Three reveal shapes, cycled so consecutive categories never enter the same way. */
const REVEALS = [
  { from: "inset(100% 0% 0% 0%)", to: "inset(0% 0% 0% 0%)" },
  { from: "circle(0% at 62% 58%)", to: "circle(120% at 62% 58%)" },
  { from: "polygon(0% 0%, 0% 0%, -30% 100%, 0% 100%)", to: "polygon(0% 0%, 130% 0%, 100% 100%, 0% 100%)" },
];

function CategoryVisual({ category, art, sizes }: { category: PublicCategory; art: CategoryArt; sizes: string }) {
  const { categoryName } = useI18n();
  const label = categoryName(category.name);
  const real = !isPlaceholder(category.image) ? resolveMediaUrl(category.image) : undefined;

  if (real) return <RemoteImage src={real} alt={label} />;
  if (art.photo) return <Photo name={art.photo} alt={label} sizes={sizes} />;
  if (art.cutout)
    return (
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 40%, #fff6ee 0%, ${art.tint} 58%, #b98a70 120%)` }}>
        <div className="absolute bottom-[16%] left-1/2 h-[6%] w-[34%] -translate-x-1/2 rounded-[50%] bg-[#6b3a22]/35 blur-xl" />
        <Cutout
          name={art.cutout}
          alt={label}
          sizes={sizes}
          className="absolute bottom-[18%] left-1/2 h-[64%] w-auto -translate-x-1/2 drop-shadow-[0_30px_30px_rgba(90,40,20,0.3)]"
        />
      </div>
    );
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: art.tint }}>
      <span className="font-display text-[clamp(4rem,10vw,9rem)] text-ivory/80">{label.slice(0, 1)}</span>
    </div>
  );
}

function PinnedWorld({ list }: { list: PublicCategory[] }) {
  const { t, lang, categoryName } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const n = list.length;

  useGsap(
    () => {
      const stage = stageRef.current;
      if (!stage || n === 0) return;
      const q = gsap.utils.selector(stage);
      const imgs = q("[data-cat-img]");
      const inners = q("[data-cat-inner]");
      const dims = q("[data-cat-dim]");
      const names = q("[data-cat-name]");
      const counts = q("[data-cat-count]");
      const tags = q("[data-cat-tag]");
      const detailAt = (i: number) => stage.querySelector<HTMLElement>(`[data-cat-detail="${i}"]`);

      imgs.forEach((el, i) => i > 0 && gsap.set(el, { clipPath: REVEALS[(i - 1) % REVEALS.length]!.from }));
      gsap.set([...names.slice(1), ...counts.slice(1)], { yPercent: 115 });
      gsap.set(tags.slice(1), { opacity: 0, y: 14 });
      list.forEach((_, i) => {
        const d = detailAt(i);
        if (d && i > 0) gsap.set(d, { clipPath: "inset(100% 0% 0% 0%)", y: 70 });
      });

      gsap.fromTo(
        q("[data-cat-frame]"),
        { clipPath: "inset(22% 0% 0% 14% round 22px)" },
        {
          clipPath: "inset(0% 0% 0% 0% round 22px)",
          ease: "none",
          scrollTrigger: { trigger: stage, start: "top bottom", end: "top top", scrub: true },
        },
      );

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: stage,
          start: "top top",
          end: () => `+=${Math.max(1, n - 1) * window.innerHeight * 0.9}`,
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      tl.fromTo(q("[data-cat-progress]"), { scaleX: 1 / n }, { scaleX: 1, duration: Math.max(1, n - 1) }, 0);

      for (let i = 1; i < n; i++) {
        const at = i - 1;
        const reveal = REVEALS[(i - 1) % REVEALS.length]!;
        tl.to(imgs[i - 1]!, { scale: 0.9, filter: "blur(7px)", duration: 1, ease: "power1.in" }, at)
          .to(dims[i - 1]!, { opacity: 0.4, duration: 1 }, at)
          .set(imgs[i - 1]!, { autoAlpha: 0 }, at + 1)
          .to(imgs[i]!, { clipPath: reveal.to, duration: 1, ease: "power2.inOut" }, at)
          .fromTo(inners[i]!, { scale: 1.32 }, { scale: 1, duration: 1.15, ease: "power2.out" }, at)
          .to([names[i - 1]!, counts[i - 1]!], { yPercent: -115, duration: 0.45, ease: "power2.in" }, at)
          .to([names[i]!, counts[i]!], { yPercent: 0, duration: 0.6, ease: "power3.out" }, at + 0.38)
          .to(tags[i - 1]!, { opacity: 0, y: -14, duration: 0.3 }, at)
          .to(tags[i]!, { opacity: 1, y: 0, duration: 0.45 }, at + 0.5);

        const prev = detailAt(i - 1);
        const next = detailAt(i);
        if (prev) tl.to(prev, { y: -50, opacity: 0, duration: 0.5, ease: "power2.in" }, at);
        if (next) tl.to(next, { clipPath: "inset(0% 0% 0% 0%)", y: 0, duration: 0.75, ease: "power3.out" }, at + 0.4);
      }
      tl.to({}, { duration: 0.35 });
    },
    [n, lang],
    stageRef,
  );

  return (
    <div ref={stageRef} className="relative h-[100svh] min-h-[640px] overflow-hidden">
      <div className="frame grid h-full grid-cols-12 gap-x-6 pb-[7vh] pt-[15vh]">
        <div className="col-span-5 flex flex-col">
          <SectionLabel index={2} className="text-smoke">
            {t.categories.eyebrow}
          </SectionLabel>
          <SplitTextReveal id="categories-title" lines={t.categories.lines} className="t-title mt-6 max-w-[28rem]" />
          <p className="t-lead mt-5 max-w-[24rem] text-smoke">{t.categories.body}</p>

          <div className="mt-auto">
            <div className="flex items-center gap-4 text-sm text-smoke">
              <span className="relative h-[1.4em] w-[2ch] overflow-hidden font-display text-base text-oho">
                {list.map((c, i) => (
                  <span key={c._id} data-cat-count className="absolute inset-0">
                    {formatIndex(i + 1, lang)}
                  </span>
                ))}
              </span>
              <span className="relative h-px w-36 bg-charcoal/15">
                <span data-cat-progress className="absolute inset-0 origin-left bg-oho" />
              </span>
              <span>{t.categories.count(n)}</span>
            </div>
            <div className="relative mt-4 h-[clamp(11rem,26vh,15rem)]">
              {list.map((c) => {
                const art = categoryArt(c.name);
                return (
                  <div key={c._id} className="absolute inset-x-0 top-0">
                    <h3 className="overflow-hidden pb-[0.1em] font-display text-[clamp(2.6rem,4.4vw,4.6rem)] leading-[1.1] tracking-[-0.02em] [html[lang=hi]_&]:leading-[1.2] [html[lang=hi]_&]:tracking-normal">
                      <span data-cat-name className="block">
                        {categoryName(c.name)}
                      </span>
                    </h3>
                    <p data-cat-tag className="mt-2 text-[1.02rem] text-smoke">
                      {t.categoryTaglines[art.key] ?? t.categoryTaglines.default}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative col-span-7 col-start-6">
          <div data-cat-frame className="absolute inset-y-0 right-0 w-[88%] overflow-hidden rounded-[22px] bg-sand">
            {list.map((c) => {
              const art = categoryArt(c.name);
              return (
                <div key={c._id} data-cat-img className="absolute inset-0 overflow-hidden will-change-[clip-path,transform]" style={{ background: art.tint }}>
                  <div data-cat-inner className="absolute inset-0">
                    <CategoryVisual category={c} art={art} sizes="(min-width: 1024px) 52vw, 100vw" />
                  </div>
                  <div data-cat-dim className="absolute inset-0 bg-charcoal opacity-0" />
                </div>
              );
            })}
          </div>
          {list.map((c, i) => {
            const art = categoryArt(c.name);
            if (!art.detail) return null;
            return (
              <figure
                key={c._id}
                data-cat-detail={i}
                className="absolute bottom-[8%] left-0 z-10 aspect-[4/5] w-[30%] overflow-hidden rounded-[14px] border-[6px] border-ivory bg-sand shadow-[var(--shadow-panel)]"
              >
                <Photo name={art.detail} alt="" sizes="18vw" />
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryStrip({ list }: { list: PublicCategory[] }) {
  const { t, lang, categoryName } = useI18n();
  return (
    <div className="pb-20 pt-24 lg:pb-32 lg:pt-36">
      <div className="frame lg:grid lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-6">
          <SectionLabel index={2} className="text-smoke">
            {t.categories.eyebrow}
          </SectionLabel>
          <SplitTextReveal id="categories-title" lines={t.categories.lines} className="t-title mt-5" />
        </div>
        <p className="t-lead mt-5 max-w-[26rem] text-smoke lg:col-span-4 lg:col-start-9 lg:self-end">{t.categories.body}</p>
      </div>
      <ul
        aria-label={t.categories.eyebrow}
        className="no-scrollbar mt-10 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto overscroll-x-contain px-5 pb-2 sm:scroll-px-8 sm:px-8 lg:mt-14 lg:scroll-px-12 lg:gap-6 lg:px-12"
      >
        {list.map((c, i) => {
          const art = categoryArt(c.name);
          return (
            <li key={c._id} className="w-[76vw] max-w-[22rem] shrink-0 snap-start lg:w-[28vw] lg:max-w-[26rem]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[18px]" style={{ background: art.tint }}>
                <CategoryVisual category={c} art={art} sizes="(min-width: 1024px) 28vw, 76vw" />
              </div>
              <p className="mt-4 font-display text-sm text-oho">{formatIndex(i + 1, lang)}</p>
              <h3 className="mt-1 font-display text-[1.7rem] leading-tight">{categoryName(c.name)}</h3>
              <p className="mt-1 text-sm text-smoke">{t.categoryTaglines[art.key] ?? t.categoryTaglines.default}</p>
            </li>
          );
        })}
      </ul>
      <p aria-hidden className="frame mt-5 text-xs text-smoke lg:hidden">
        {t.categories.swipe} →
      </p>
    </div>
  );
}

export function CategoryWorld({ categories }: { categories: PublicCategory[] }) {
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const list = useMemo(() => sortCategories(categories), [categories]);
  if (list.length === 0) return null;

  return (
    <section id="categories" data-nav="light" aria-labelledby="categories-title" className={cn("relative z-10 bg-ivory text-charcoal")}>
      <RibbonEdge tone="ivory" />
      {desktop && !reduced ? <PinnedWorld list={list} /> : <CategoryStrip list={list} />}
    </section>
  );
}
