import { useRef } from "react";
import { Photo, RemoteImage } from "@/components/media/Photo";
import { HorizontalGallery } from "@/components/motion/HorizontalGallery";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useI18n } from "@/i18n/LanguageProvider";
import { resolveMediaUrl } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { gsap, useGsap } from "@/lib/gsap";
import { isPlaceholder, productArt } from "@/lib/media";
import type { PublicProduct } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

/** Asymmetric placements for the composition; depth drives scroll parallax, mask the entrance direction. */
const PLACEMENT = [
  { cell: "lg:col-span-6 lg:col-start-6", ratio: "aspect-[5/4]", depth: 0, mask: "inset(0% 0% 100% 0% round 18px)" },
  { cell: "lg:col-span-4 lg:col-start-2 lg:-mt-[16vh]", ratio: "aspect-[4/5]", depth: 1, mask: "inset(0% 100% 0% 0% round 18px)" },
  { cell: "lg:col-span-5 lg:col-start-7 lg:mt-[8vh]", ratio: "aspect-square", depth: 0.5, mask: "inset(100% 0% 0% 0% round 18px)" },
  { cell: "lg:col-span-4 lg:col-start-2 lg:-mt-[10vh]", ratio: "aspect-[4/5]", depth: 1, mask: "inset(0% 0% 0% 100% round 18px)" },
];

function productImage(p: PublicProduct) {
  const api = p.image ?? p.thumbnail;
  const real = !isPlaceholder(api) ? resolveMediaUrl(api) : undefined;
  return { real, art: real ? undefined : productArt(p.name) };
}

function ProductVisual({ product, sizes, priority }: { product: PublicProduct; sizes: string; priority?: boolean }) {
  const { t } = useI18n();
  const { real, art } = productImage(product);
  if (real) return <RemoteImage src={real} alt={product.name} />;
  if (art) return <Photo name={art} alt={`${product.name} — ${t.products.representative}`} sizes={sizes} priority={priority} />;
  return (
    <div className="absolute inset-0 flex items-end bg-[linear-gradient(160deg,#efe4d3,#dccab0)] p-[8%]">
      <span className="font-display text-[clamp(2rem,4vw,3.6rem)] leading-[1.05] text-charcoal/80">{product.name}</span>
    </div>
  );
}

function RepresentativeBadge({ product, className }: { product: PublicProduct; className?: string }) {
  const { t } = useI18n();
  if (!productImage(product).art) return null;
  return (
    <span className={cn("rounded-full bg-ivory/85 px-3 py-1 text-[0.7rem] font-semibold text-charcoal/80 backdrop-blur", className)}>
      {t.products.representative}
    </span>
  );
}

function Price({ product, className }: { product: PublicProduct; className?: string }) {
  const { t } = useI18n();
  const price = formatINR(product.price);
  const mrp = product.mrp && product.price && product.mrp > product.price ? formatINR(product.mrp) : null;
  if (!price) return null;
  return (
    <p className={cn("shrink-0 text-right", className)}>
      <span className="block font-display">{price}</span>
      {mrp && (
        <span className="text-sm opacity-60">
          {t.products.mrp} <s>{mrp}</s>
        </span>
      )}
    </p>
  );
}

function Caption({ product }: { product: PublicProduct }) {
  const { t, categoryName } = useI18n();
  return (
    <div className="mt-5 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {product.category?.name && <p className="eyebrow text-oho-deep">{categoryName(product.category.name)}</p>}
        <h3 className="mt-2 font-display text-[clamp(1.45rem,2.1vw,2rem)] leading-tight">{product.name}</h3>
        {product.vendor?.name && (
          <p className="mt-1.5 text-sm text-smoke">
            {t.products.soldBy}: <span className="font-medium text-ink">{product.vendor.name}</span>
          </p>
        )}
      </div>
      <Price product={product} className="text-2xl" />
    </div>
  );
}

function DevNote({ show }: { show: boolean }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <p role="note" className="mt-6 inline-block rounded-full border border-dashed border-oho px-4 py-2 text-sm text-oho-deep">
      {t.footer.dev}
    </p>
  );
}

/** Opening shot: the first product grows from the category frame's footprint to full-bleed. */
function ProductStage({ product, fixtures }: { product: PublicProduct; fixtures: boolean }) {
  const { t, lang, categoryName } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      const el = ref.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: el, start: "top top", end: "+=150%", pin: true, scrub: 0.6, anticipatePin: 1 },
      });
      tl.fromTo(
        q("[data-p-frame]"),
        { clipPath: "inset(15vh 3rem 7vh 47vw round 22px)" },
        { clipPath: "inset(0vh 0rem 0vh 0vw round 0px)", duration: 1, ease: "power2.inOut" },
        0,
      )
        .fromTo(q("[data-p-inner]"), { scale: 1.2 }, { scale: 1, duration: 1.1, ease: "power2.out" }, 0)
        .to(q("[data-p-shade]"), { opacity: 1, duration: 0.6 }, 0.4)
        .to(q("[data-p-title]"), { color: "#f5eee3", duration: 0.4 }, 0.45)
        .fromTo(q("[data-p-info] > *"), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, ease: "power3.out" }, 0.8)
        .to({}, { duration: 0.35 });
    },
    [lang],
    ref,
  );

  return (
    <div ref={ref} className="relative h-[100svh] min-h-[640px] overflow-hidden">
      <div data-p-frame className="absolute inset-0 overflow-hidden bg-sand will-change-[clip-path]">
        <div data-p-inner className="absolute inset-0">
          <ProductVisual product={product} sizes="100vw" />
        </div>
        <div
          data-p-shade
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,11,9,0.62),transparent_45%),linear-gradient(180deg,rgba(14,11,9,0.35),transparent_32%,transparent_50%,rgba(14,11,9,0.85))] opacity-0"
        />
      </div>

      <div className="frame relative z-10 flex h-full flex-col pb-[7vh] pt-[15vh]">
        <div data-p-title className="max-w-[44%] text-charcoal">
          <SectionLabel index={3} className="opacity-70">
            {t.products.eyebrow}
          </SectionLabel>
          <SplitTextReveal id="products-title" lines={t.products.lines} className="t-display mt-6" />
          <DevNote show={fixtures} />
        </div>

        <div data-p-info className="mt-auto flex items-end justify-between gap-10 text-ivory">
          <div className="min-w-0">
            {product.category?.name && <p className="eyebrow text-ember">{categoryName(product.category.name)}</p>}
            <h3 className="t-display mt-3">{product.name}</h3>
            {product.vendor?.name && (
              <p className="mt-3 text-ivory/70">
                {t.products.soldBy}: <span className="font-medium text-ivory">{product.vendor.name}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-4">
            <RepresentativeBadge product={product} />
            <Price product={product} className="text-[clamp(2.2rem,3.6vw,3.6rem)] leading-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Composition({ products, animate, intro, lead }: { products: PublicProduct[]; animate: boolean; intro?: boolean; lead?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      const el = ref.current;
      if (!el || !animate) return;
      el.querySelectorAll<HTMLElement>("[data-p-item]").forEach((item, i) => {
        const place = PLACEMENT[i % PLACEMENT.length]!;
        const mask = item.querySelector("[data-p-mask]");
        const img = item.querySelector("[data-p-img]");
        const st = { trigger: item, start: "top 95%", end: "top 40%", scrub: 0.6 };
        gsap.fromTo(mask, { clipPath: place.mask }, { clipPath: "inset(0% 0% 0% 0% round 18px)", ease: "power2.out", scrollTrigger: st });
        gsap.fromTo(img, { scale: 1.3 }, { scale: 1, ease: "power2.out", scrollTrigger: st });
        gsap.fromTo(item.querySelector("[data-p-caption]"), { opacity: 0, y: 30 }, { opacity: 1, y: 0, ease: "power2.out", scrollTrigger: { ...st, start: "top 70%", end: "top 35%" } });
        if (place.depth)
          gsap.fromTo(
            item,
            { yPercent: 10 * place.depth },
            { yPercent: -10 * place.depth, ease: "none", scrollTrigger: { trigger: item, start: "top bottom", end: "bottom top", scrub: true } },
          );
      });
    },
    [animate, products.length],
    ref,
  );

  if (products.length === 0) return null;

  return (
    <div ref={ref} className={cn("frame grid grid-cols-1 gap-y-16 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-12 lg:gap-y-0", intro ? "pb-24" : "pb-[6vh] pt-[16vh]")}>
      {lead && (
        <p className="font-display text-[clamp(1.5rem,2.2vw,2.1rem)] leading-[1.3] text-charcoal/85 lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:self-center [html[lang=hi]_&]:leading-[1.5]">
          {lead}
        </p>
      )}
      {products.map((p, i) => {
        const place = PLACEMENT[i % PLACEMENT.length]!;
        return (
          <article key={p._id} data-p-item className={cn("relative", place.cell)}>
            <div data-p-mask className={cn("relative overflow-hidden rounded-[18px] bg-sand", place.ratio)}>
              <div data-p-img className="absolute inset-0">
                <ProductVisual product={p} sizes="(min-width: 1024px) 45vw, (min-width: 640px) 50vw, 100vw" />
              </div>
              <RepresentativeBadge product={p} className="absolute left-4 top-4" />
            </div>
            <div data-p-caption>
              <Caption product={p} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MoreProducts({ products }: { products: PublicProduct[] }) {
  const { t } = useI18n();
  if (products.length === 0) return null;
  return (
    <div className="pb-24">
      <p className="frame eyebrow mb-8 text-smoke">{t.products.more}</p>
      <HorizontalGallery label={t.products.more} deps={[products.length]} trackClassName="lg:h-full lg:gap-[3vw] lg:px-[6vw]">
        {products.map((p) => (
          <article key={p._id} className="w-[72vw] max-w-[22rem] shrink-0 lg:w-[26vw] lg:max-w-none">
            <div data-hg-reveal className="relative aspect-[4/5] overflow-hidden rounded-[18px] bg-sand">
              <div data-hg-parallax="6" className="absolute inset-[0_-8%]">
                <ProductVisual product={p} sizes="(min-width: 1024px) 26vw, 72vw" />
              </div>
              <RepresentativeBadge product={p} className="absolute left-4 top-4" />
            </div>
            <div data-hg-text>
              <Caption product={p} />
            </div>
          </article>
        ))}
      </HorizontalGallery>
    </div>
  );
}

export function ProductGallery({ products, fixtures }: { products: PublicProduct[]; fixtures: boolean }) {
  const { t } = useI18n();
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const animate = desktop && !reduced;
  if (products.length === 0) return null;

  const [first, ...rest] = products.slice(0, 12);

  return (
    <section id="products" data-nav="light" aria-labelledby="products-title" className="relative z-10 bg-ivory text-charcoal">
      {animate ? (
        <>
          <ProductStage product={first!} fixtures={fixtures} />
          <Composition products={rest.slice(0, 4)} animate lead={t.products.body} />
          <MoreProducts products={rest.slice(4)} />
          <div aria-hidden className="h-[22vh] bg-gradient-to-b from-ivory to-sand" />
        </>
      ) : (
        <>
          <div className="frame pb-14 pt-24">
            <SectionLabel index={3} className="text-smoke">
              {t.products.eyebrow}
            </SectionLabel>
            <SplitTextReveal id="products-title" lines={t.products.lines} className="t-display mt-5" />
            <p className="t-lead mt-5 max-w-[26rem] text-smoke">{t.products.body}</p>
            <DevNote show={fixtures} />
          </div>
          <Composition products={products.slice(0, 8)} animate={false} intro />
        </>
      )}
    </section>
  );
}
