import { ArrowUpRight, MapPin } from "lucide-react";
import { useRef } from "react";
import { Photo, RemoteImage } from "@/components/media/Photo";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useI18n } from "@/i18n/LanguageProvider";
import { resolveMediaUrl, VENDOR_PANEL_URL } from "@/lib/api";
import { gsap, useGsap } from "@/lib/gsap";
import { isPlaceholder, type PhotoKey } from "@/lib/media";
import type { PublicVendor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

type Portrait = { photo: PhotoKey; caption: "silk" | "lehenga" | "brass" | "flower"; place: string; ratio: string; drift: [number, number] };

/** Supporting portraits sit behind the main frame at different depths and drift toward it as it grows. */
const SUPPORT: Portrait[] = [
  { photo: "silk-weaving", caption: "silk", place: "left-[4vw] top-[50vh] w-[15vw]", ratio: "aspect-[3/4]", drift: [14, -6] },
  { photo: "lehenga-store", caption: "lehenga", place: "right-[5vw] top-[11vh] w-[18vw]", ratio: "aspect-[4/5]", drift: [-12, 10] },
  { photo: "brass-shop", caption: "brass", place: "left-[21vw] bottom-[5vh] w-[12vw]", ratio: "aspect-square", drift: [10, -12] },
  { photo: "flower-seller", caption: "flower", place: "right-[14vw] bottom-[7vh] w-[16vw]", ratio: "aspect-[4/3]", drift: [-10, -10] },
];

function VendorRow({ vendor, tone }: { vendor: PublicVendor; tone: "light" | "dark" }) {
  const { t, categoryName } = useI18n();
  const logo = !isPlaceholder(vendor.shopLogo) ? resolveMediaUrl(vendor.shopLogo) : undefined;
  const initials = vendor.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const place = vendor.city || vendor.location?.split(",").slice(-2, -1)[0]?.trim();
  const dark = tone === "dark";

  return (
    <li className={cn("flex items-center gap-4 border-t py-4", dark ? "border-ivory/15" : "border-charcoal/10")}>
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-oho font-display text-base text-white">
        {logo ? <RemoteImage src={logo} alt="" /> : initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg">{vendor.businessName || vendor.name}</p>
        <p className={cn("mt-0.5 flex flex-wrap items-center gap-x-3 text-sm", dark ? "text-ivory/60" : "text-smoke")}>
          {vendor.category?.name && <span>{categoryName(vendor.category.name)}</span>}
          {place && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {place}
            </span>
          )}
        </p>
      </div>
      {typeof vendor.productCount === "number" && vendor.productCount > 0 && (
        <span className={cn("shrink-0 text-sm", dark ? "text-ivory/70" : "text-smoke")}>{t.people.productCount(vendor.productCount)}</span>
      )}
    </li>
  );
}

function PeopleInfo({ vendors, tone }: { vendors: PublicVendor[]; tone: "light" | "dark" }) {
  const { t } = useI18n();
  const dark = tone === "dark";
  return (
    <>
      <p className={cn("t-lead max-w-[30rem]", dark ? "text-ivory/80" : "text-smoke")}>{t.people.body}</p>
      <p className={cn("mt-5 text-sm", dark ? "text-ivory/60" : "text-smoke")}>{t.people.types.join("  ·  ")}</p>
      {vendors.length > 0 && (
        <div className="mt-8">
          <p className={cn("eyebrow mb-1", dark ? "text-ivory/50" : "text-smoke")}>{t.people.featured}</p>
          <ul>
            {vendors.slice(0, 3).map((v) => (
              <VendorRow key={v._id} vendor={v} tone={tone} />
            ))}
          </ul>
        </div>
      )}
      <MagneticButton
        href={`${VENDOR_PANEL_URL}/vendor/register`}
        target="_blank"
        rel="noopener"
        variant={dark ? "light" : "dark"}
        className="mt-8"
        icon={<ArrowUpRight className="size-4" />}
      >
        {t.people.join}
      </MagneticButton>
    </>
  );
}

function PinnedPeople({ vendors }: { vendors: PublicVendor[] }) {
  const { t, lang } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      const el = ref.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const lines = q("[data-people-line]");
      gsap.set(q("[data-people-info]"), { opacity: 0, y: 40 });
      gsap.set(q("[data-people-main-caption]"), { opacity: 0 });

      // Entrance plays while the section scrolls in, so the stage is composed before it pins.
      gsap
        .timeline({ scrollTrigger: { trigger: el, start: "top 65%", toggleActions: "play none none reverse" } })
        .fromTo(q("[data-people-line] .split-inner"), { yPercent: 118 }, { yPercent: 0, duration: 1.1, stagger: 0.07, ease: "expo.out" }, 0)
        .fromTo(q("[data-people-support] > div"), { opacity: 0, y: 90 }, { opacity: 1, y: 0, duration: 1.2, stagger: 0.09, ease: "expo.out" }, 0.1);

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: el, start: "top top", end: "+=200%", pin: true, scrub: 0.7, anticipatePin: 1 },
      });

      tl.fromTo(
        q("[data-people-main]"),
        { clipPath: "inset(22vh 36vw 20vh 36vw round 18px)" },
        { clipPath: "inset(0vh 0vw 0vh 0vw round 0px)", duration: 1, ease: "power2.inOut" },
        0,
      )
        .fromTo(q("[data-people-main-img]"), { scale: 1.35 }, { scale: 1, duration: 1.1, ease: "power2.out" }, 0)
        .to(q("[data-people-support] figcaption"), { opacity: 0, duration: 0.2 }, 0)
        .to(lines, { color: "#f5eee3", duration: 0.35 }, 0.3)
        .to(q("[data-people-eyebrow]"), { color: "rgba(245,238,227,0.7)", duration: 0.35 }, 0.3)
        .to(q("[data-people-main-caption]"), { opacity: 1, duration: 0.2 }, 0.6)
        .to(q("[data-people-shade]"), { opacity: 0.86, duration: 0.6 }, 0.8)
        .to(q("[data-people-main-caption]"), { opacity: 0, duration: 0.2 }, 0.85)
        .to(q("[data-people-heading]"), { y: () => -window.innerHeight * 0.06, duration: 0.6, ease: "power2.inOut" }, 0.8)
        .to(q("[data-people-info]"), { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, 1.0)
        .to({}, { duration: 0.4 });

      q("[data-people-support]").forEach((card, i) => {
        const [dx, dy] = SUPPORT[i]!.drift;
        tl.fromTo(
          card,
          { filter: "brightness(1)" },
          { xPercent: dx * 3, yPercent: dy * 3, scale: 0.78, filter: "brightness(0.55)", duration: 0.9, ease: "power2.in" },
          0.05,
        );
      });
    },
    [lang],
    ref,
  );

  return (
    <div ref={ref} className="relative h-[100svh] min-h-[680px] overflow-hidden bg-sand">
      {SUPPORT.map((s) => (
        <figure key={s.photo} data-people-support className={cn("absolute z-0", s.place)}>
          <div className={cn("overflow-hidden rounded-[14px] shadow-[var(--shadow-panel)]", s.ratio)}>
            <Photo name={s.photo} alt={t.people.captions[s.caption]} sizes="20vw" />
          </div>
          <figcaption className="mt-2 text-xs text-smoke">
            {t.people.captions[s.caption]}
          </figcaption>
        </figure>
      ))}

      <div data-people-main className="absolute inset-0 z-10 overflow-hidden will-change-[clip-path]">
        <div data-people-main-img className="absolute inset-0">
          <Photo name="block-print-artisan" alt={t.people.captions.blockPrint} sizes="100vw" className="object-[50%_30%]" />
        </div>
        <div data-people-shade className="absolute inset-0 bg-[linear-gradient(90deg,#0e0b09_0%,rgba(14,11,9,0.82)_45%,rgba(14,11,9,0.35)_100%)] opacity-0" />
      </div>

      <div className="frame relative z-20 grid h-full grid-cols-12 grid-rows-[auto_1fr] gap-x-6 pb-[7vh] pt-[14vh]">
        <div data-people-heading className="col-span-12 flex flex-col">
          <SectionLabel index={4} className="text-smoke">
            <span data-people-eyebrow>{t.people.eyebrow}</span>
          </SectionLabel>
          <h2 id="sellers-title" aria-label={t.people.lines.map((l) => l.map((s) => s.t).join("")).join(" ")} className="mt-5">
            {t.people.lines.map((line, i) => (
              <div key={i} data-people-line aria-hidden className={cn("text-charcoal", i === 1 && "ml-[22vw]")}>
                <SplitTextReveal as="div" trigger="manual" lines={[line]} className="t-mega" />
              </div>
            ))}
          </h2>
        </div>
        <div data-people-info className="col-span-5 self-end text-ivory">
          <PeopleInfo vendors={vendors} tone="dark" />
        </div>
        <p data-people-main-caption className="col-span-4 col-start-9 self-end text-right text-xs text-ivory/70">
          {t.people.captions.blockPrint}
        </p>
      </div>
    </div>
  );
}

function StackedPeople({ vendors }: { vendors: PublicVendor[] }) {
  const { t } = useI18n();
  return (
    <div className="frame pb-24 pt-24 lg:grid lg:grid-cols-12 lg:gap-x-6 lg:pb-36 lg:pt-36">
      <div className="lg:col-span-5">
        <SectionLabel index={4} className="text-smoke">
          {t.people.eyebrow}
        </SectionLabel>
        <SplitTextReveal id="sellers-title" lines={t.people.lines} className="t-display mt-5" />
        <div className="mt-8">
          <PeopleInfo vendors={vendors} tone="light" />
        </div>
      </div>
      <div className="mt-14 grid grid-cols-2 gap-3 lg:col-span-7 lg:mt-0 lg:gap-5">
        <figure className="col-span-2">
          <div className="aspect-[4/3] overflow-hidden rounded-[16px]">
            <Photo name="block-print-artisan" alt={t.people.captions.blockPrint} sizes="(min-width: 1024px) 55vw, 100vw" />
          </div>
          <figcaption className="mt-2 text-xs text-smoke">{t.people.captions.blockPrint}</figcaption>
        </figure>
        {SUPPORT.map((s, i) => (
          <figure key={s.photo} className={cn(i % 2 === 1 && "mt-8")}>
            <div className="aspect-[4/5] overflow-hidden rounded-[14px]">
              <Photo name={s.photo} alt={t.people.captions[s.caption]} sizes="(min-width: 1024px) 26vw, 50vw" />
            </div>
            <figcaption className="mt-2 text-[0.7rem] leading-snug text-smoke">{t.people.captions[s.caption]}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function PeopleSection({ vendors }: { vendors: PublicVendor[] }) {
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  return (
    <section id="sellers" data-nav="light" aria-labelledby="sellers-title" className="relative z-10 bg-sand text-charcoal">
      {desktop && !reduced ? <PinnedPeople vendors={vendors} /> : <StackedPeople vendors={vendors} />}
    </section>
  );
}
