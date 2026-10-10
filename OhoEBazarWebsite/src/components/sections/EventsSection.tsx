import { MessageSquareText } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { Photo, RemoteImage } from "@/components/media/Photo";
import { HorizontalGallery } from "@/components/motion/HorizontalGallery";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatIndex } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LanguageProvider";
import { resolveMediaUrl } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { gsap } from "@/lib/gsap";
import { isPlaceholder, serviceArt } from "@/lib/media";
import type { PublicCategory, PublicVenue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

type ServiceGroup = {
  category: PublicCategory;
  listings: number;
  from: { amount: number; unit: string } | null;
};

function groupServices(categories: PublicCategory[], venues: PublicVenue[]): ServiceGroup[] {
  return categories.map((category) => {
    const listings = venues.filter((v) => v.category?._id === category._id || v.category?.name === category.name);
    const priced = listings
      .map((v) => ({ amount: v.priceInfo?.amount ?? 0, unit: v.priceInfo?.unit ?? "full" }))
      .filter((p) => p.amount > 0)
      .sort((a, b) => a.amount - b.amount);
    return { category, listings: listings.length, from: priced[0] ?? null };
  });
}

function ServiceMeta({ group }: { group: ServiceGroup }) {
  const { t } = useI18n();
  if (group.listings === 0) return <p className="mt-4 text-sm text-ivory/55">{t.services.noListings}</p>;
  const unit = group.from ? (t.services.unit[group.from.unit as "day" | "hour" | "full"] ?? "") : "";
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ivory/75">
      <span>{t.services.listings(group.listings)}</span>
      {group.from && (
        <span className="text-ember">
          {t.services.from} {formatINR(group.from.amount)}
          {group.from.unit === "full" ? ` · ${unit}` : unit}
        </span>
      )}
    </p>
  );
}

function ServiceImage({ group, sizes }: { group: ServiceGroup; sizes: string }) {
  const { categoryName } = useI18n();
  const art = serviceArt(group.category.name);
  const real = !isPlaceholder(group.category.image) ? resolveMediaUrl(group.category.image) : undefined;
  const label = categoryName(group.category.name);
  if (real) return <RemoteImage src={real} alt={label} />;
  if (art.photo) return <Photo name={art.photo} alt={label} sizes={sizes} />;
  return <div className="absolute inset-0" style={{ background: art.tint }} />;
}

/** Tall and wide frames alternate, hung high and low, so the strip reads like a film reel rather than a card row. */
function ServicePanel({ group, index }: { group: ServiceGroup; index: number }) {
  const { t, lang, categoryName } = useI18n();
  const art = serviceArt(group.category.name);
  const tall = index % 2 === 0;

  return (
    <article className={cn("relative shrink-0", tall ? "h-[76vh] w-[32vw] self-start mt-[12vh]" : "h-[58vh] w-[46vw] self-end mb-[10vh]")}>
      <div className="absolute inset-0 overflow-hidden rounded-[6px]">
        <div data-hg-parallax="7" className="absolute inset-[0_-9%]">
          <ServiceImage group={group} sizes="(min-width: 1024px) 46vw, 80vw" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(14,8,5,0.88))]" />
      </div>
      {art.detail && (
        <div className={cn("absolute z-10 aspect-[4/5] w-[13vw] overflow-hidden rounded-[6px] shadow-[var(--shadow-panel)] ring-[6px] ring-ember-night", tall ? "-right-[5vw] top-[10%]" : "-top-[10vh] right-[8%]")}>
          <Photo name={art.detail} alt="" sizes="14vw" />
        </div>
      )}
      <div data-hg-text className="absolute inset-x-0 bottom-0 p-[2.2vw] text-ivory">
        <p className="font-display text-sm text-ember">{formatIndex(index + 1, lang)}</p>
        <h3 className="t-title mt-2">{categoryName(group.category.name)}</h3>
        <p className="mt-2 text-ivory/70">{t.serviceTaglines[art.key] ?? t.serviceTaglines.default}</p>
        <ServiceMeta group={group} />
      </div>
    </article>
  );
}

function EnquiryNote() {
  const { t } = useI18n();
  return (
    <p className="mt-8 inline-flex items-center gap-2 border-t border-ivory/15 pt-4 text-sm text-ivory/70">
      <MessageSquareText className="size-4 text-ember" aria-hidden />
      {t.services.enquiry}
    </p>
  );
}

function Pinned({ groups, enquiryMode }: { groups: ServiceGroup[]; enquiryMode: boolean }) {
  const { t, lang } = useI18n();
  const color = useMemo(() => gsap.utils.interpolate(["#1a0e0a", "#1a0e0a", "#151311"]), []);
  const sectionColor = useRef<HTMLDivElement>(null);
  const onProgress = useCallback((p: number) => {
    const el = sectionColor.current?.closest("section");
    if (el) el.style.backgroundColor = color(p);
  }, [color]);

  return (
    <div ref={sectionColor}>
      <HorizontalGallery label={t.nav.services} onProgress={onProgress} deps={[groups.length, lang]} trackClassName="h-[100svh] items-stretch gap-[5vw]">
        <div className="relative h-full w-[72vw] shrink-0 overflow-hidden">
          <Photo name="wedding-stage" alt="" sizes="72vw" className="object-[60%_50%]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#1a0e0a_0%,rgba(26,14,10,0.85)_38%,rgba(26,14,10,0.1)_75%,rgba(26,14,10,0.5)_100%)]" />
          <div className="absolute inset-y-0 left-0 flex w-[48%] flex-col justify-end pb-[10vh] pl-12 text-ivory">
            <SectionLabel index={5} className="text-ivory/60">
              {t.services.eyebrow}
            </SectionLabel>
            <SplitTextReveal id="services-title" lines={t.services.lines} className="t-display mt-6" accentClassName="text-ember" />
            <p className="t-lead mt-6 max-w-[26rem] text-ivory/70">{t.services.body}</p>
            {enquiryMode && <EnquiryNote />}
          </div>
        </div>
        {groups.map((g, i) => (
          <ServicePanel key={g.category._id} group={g} index={i} />
        ))}
        <div className="relative h-full w-screen shrink-0 overflow-hidden">
          <div data-hg-parallax="5" className="absolute inset-[0_-6%]">
            <Photo name="banquet-hall" alt="" sizes="100vw" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(0deg,#151311_0%,rgba(21,19,17,0.7)_35%,rgba(21,19,17,0.2)_70%,rgba(21,19,17,0.55)_100%)]" />
          <div data-hg-text className="frame absolute inset-x-0 bottom-0 pb-[12vh] text-ivory">
            <SplitTextReveal lines={t.services.closing} className="t-display max-w-[60rem]" accentClassName="text-ember" />
            <p className="t-lead mt-5 max-w-[30rem] text-ivory/70">{t.services.closingBody}</p>
          </div>
        </div>
      </HorizontalGallery>
    </div>
  );
}

function Stacked({ groups, enquiryMode }: { groups: ServiceGroup[]; enquiryMode: boolean }) {
  const { t, lang, categoryName } = useI18n();
  return (
    <div className="pb-20">
      <div className="relative">
        <div className="aspect-[4/5] max-h-[80svh] w-full overflow-hidden sm:aspect-[16/10]">
          <Photo name="wedding-stage" alt="" sizes="100vw" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(0deg,#1a0e0a_8%,rgba(26,14,10,0.2)_60%)]" />
      </div>
      <div className="frame -mt-24 relative">
        <SectionLabel index={5} className="text-ivory/60">
          {t.services.eyebrow}
        </SectionLabel>
        <SplitTextReveal id="services-title" lines={t.services.lines} className="t-display mt-5" accentClassName="text-ember" />
        <p className="t-lead mt-5 max-w-[30rem] text-ivory/70">{t.services.body}</p>
        {enquiryMode && <EnquiryNote />}
      </div>
      <ul aria-label={t.nav.services} className="no-scrollbar mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto overscroll-x-contain px-5 pb-2 sm:scroll-px-8 sm:px-8 lg:px-12">
        {groups.map((g, i) => {
          const art = serviceArt(g.category.name);
          return (
            <li key={g.category._id} className="relative aspect-[3/4] w-[74vw] max-w-[22rem] shrink-0 snap-start overflow-hidden rounded-[6px] lg:w-[26vw]">
              <ServiceImage group={g} sizes="(min-width: 1024px) 26vw, 74vw" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(14,8,5,0.9))]" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="font-display text-sm text-ember">{formatIndex(i + 1, lang)}</p>
                <h3 className="mt-1 font-display text-[1.6rem] leading-tight">{categoryName(g.category.name)}</h3>
                <p className="mt-1 text-sm text-ivory/70">{t.serviceTaglines[art.key] ?? t.serviceTaglines.default}</p>
                <ServiceMeta group={g} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="frame mt-16">
        <div className="relative aspect-[16/10] overflow-hidden rounded-[6px]">
          <Photo name="banquet-hall" alt="" sizes="100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(21,19,17,0.85),transparent_70%)]" />
        </div>
        <SplitTextReveal lines={t.services.closing} className="t-title mt-8" accentClassName="text-ember" />
        <p className="t-lead mt-4 max-w-[30rem] text-ivory/70">{t.services.closingBody}</p>
      </div>
    </div>
  );
}

export function EventsSection({ categories, venues, enquiryMode }: { categories: PublicCategory[]; venues: PublicVenue[]; enquiryMode: boolean }) {
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const groups = useMemo(() => groupServices(categories, venues), [categories, venues]);
  if (groups.length === 0) return null;

  return (
    <section id="services" data-nav="dark" aria-labelledby="services-title" className="relative z-10 bg-ember-night text-ivory">
      {desktop && !reduced ? <Pinned groups={groups} enquiryMode={enquiryMode} /> : <Stacked groups={groups} enquiryMode={enquiryMode} />}
    </section>
  );
}
