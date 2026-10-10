import { useRef } from "react";
import { Photo } from "@/components/media/Photo";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { Lines } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LanguageProvider";
import { gsap, useGsap } from "@/lib/gsap";
import { photoSrc } from "@/lib/media";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./SectionLabel";

const COLS = 3;
const ROWS = 2;
/** Where each fragment starts before it locks into place: [x vw, y vh, rotation deg, scale]. */
const SCATTER: [number, number, number, number][] = [
  [-42, -24, -14, 0.62],
  [-8, -38, 9, 0.74],
  [16, -20, 16, 0.58],
  [-50, 22, 11, 0.7],
  [-14, 34, -10, 0.66],
  [12, 26, -16, 0.78],
];
const WORD_SCATTER: [number, number, number][] = [
  [-18, -26, -9],
  [26, 30, 7],
  [-30, 18, 6],
  [22, -22, -7],
];

const plain = (lines: Lines) => lines.map((l) => l.map((s) => s.t).join("")).join(" ");

function Words({ lines, kind }: { lines: Lines; kind: "scatter" | "mask" }) {
  return (
    <span aria-hidden className="block">
      {lines.map((line, li) =>
        line.map((seg, si) =>
          seg.t.split(/(\s+)/).map((w, wi) => {
            if (!w.trim()) return w;
            const cls = cn("inline-block", seg.accent && "text-oho");
            return kind === "scatter" ? (
              <span key={`${li}-${si}-${wi}`} data-story-word className={cls}>
                {w}
              </span>
            ) : (
              <span key={`${li}-${si}-${wi}`} className="split-mask">
                <span data-story-rise className={cn("split-inner", seg.accent && "text-oho")}>
                  {w}
                </span>
              </span>
            );
          }),
        ),
      )}
    </span>
  );
}

const HEADLINE =
  "font-display text-[clamp(3rem,7.4vw,7.6rem)] leading-[0.98] tracking-[-0.04em] [html[lang=hi]_&]:text-[clamp(2.7rem,6.4vw,6.6rem)] [html[lang=hi]_&]:leading-[1.2] [html[lang=hi]_&]:tracking-normal";

export function BrandStory() {
  const { t, lang } = useI18n();
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const animate = desktop && !reduced;
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      const el = ref.current;
      if (!el || !animate) return;
      const q = gsap.utils.selector(el);
      const section = el.closest("section");
      const tiles = q("[data-story-tile]");
      const words = q("[data-story-word]");

      tiles.forEach((tile, i) => {
        const [x, y, r, s] = SCATTER[i]!;
        gsap.set(tile, { x: `${x}vw`, y: `${y}vh`, rotate: r, scale: s, opacity: 0.9 });
      });
      words.forEach((w, i) => {
        const [x, y, r] = WORD_SCATTER[i % WORD_SCATTER.length]!;
        gsap.set(w, { x: `${x}vw`, y: `${y}vh`, rotate: r, opacity: 0.35 });
      });
      gsap.set(q("[data-story-rise]"), { yPercent: 118 });
      gsap.set(q("[data-story-fade]"), { opacity: 0, y: 30 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: el, start: "top top", end: "+=220%", pin: true, scrub: 0.8, anticipatePin: 1 },
      });

      tl.to(tiles, { opacity: 1, duration: 0.3, stagger: 0.03 }, 0)
        .to(tiles, { x: 0, y: 0, rotate: 0, scale: 1, duration: 1, stagger: 0.05, ease: "power3.inOut" }, 0)
        .to(words, { opacity: 1, duration: 0.5, stagger: 0.05 }, 0.1)
        .to(words, { x: 0, y: 0, rotate: 0, duration: 0.9, stagger: 0.06, ease: "power3.inOut" }, 0.1)
        .to(q("[data-story-rise]"), { yPercent: 0, duration: 0.45, stagger: 0.07, ease: "power3.out" }, 1.0)
        .to(q("[data-story-seam]"), { opacity: 0, duration: 0.3 }, 1.15)
        .to(q("[data-story-fade]"), { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, ease: "power3.out" }, 1.25);

      if (section) {
        tl.to(section, { backgroundColor: "#f5eee3", color: "#151311", duration: 0.5 }, 1.75).to(
          q("[data-story-muted]"),
          { color: "rgba(21,19,17,0.62)", duration: 0.5 },
          1.75,
        );
      }
      tl.to({}, { duration: 0.25 });
    },
    [animate, lang],
    ref,
  );

  return (
    <section id="story" data-nav="dark" aria-labelledby="story-title" className="relative z-10 overflow-hidden bg-charcoal text-ivory">
      <div ref={ref} className={cn("relative", animate && "h-[100svh] min-h-[640px]")}>
        <div className={cn("frame grid h-full grid-cols-1 items-center gap-y-12 lg:grid-cols-12 lg:gap-x-6", animate ? "" : "py-24 lg:py-36")}>
          <div className="relative z-10 lg:col-span-6">
            <SectionLabel index={7} className="opacity-60">
              {t.story.eyebrow}
            </SectionLabel>
            <h2 id="story-title" aria-label={`${plain(t.story.line1)} ${plain(t.story.line2)}`} className={cn("mt-7", HEADLINE)}>
              <Words lines={t.story.line1} kind={animate ? "scatter" : "mask"} />
              <Words lines={t.story.line2} kind="mask" />
            </h2>
            <p data-story-fade data-story-muted className="t-lead mt-8 max-w-[30rem] text-ivory/65">
              {t.story.body}
            </p>
          </div>

          <div className="relative lg:col-span-6">
            {animate ? (
              <div className="relative aspect-[1280/854]">
                {Array.from({ length: COLS * ROWS }, (_, i) => {
                  const c = i % COLS;
                  const r = Math.floor(i / COLS);
                  return (
                    <div
                      key={i}
                      data-story-tile
                      className="absolute will-change-transform"
                      style={{
                        left: `${(c * 100) / COLS}%`,
                        top: `${(r * 100) / ROWS}%`,
                        width: `${100 / COLS + 0.05}%`,
                        height: `${100 / ROWS + 0.05}%`,
                        backgroundImage: `url(${photoSrc("gifts")})`,
                        backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
                        backgroundPosition: `${(c * 100) / (COLS - 1)}% ${(r * 100) / (ROWS - 1)}%`,
                      }}
                    >
                      <span data-story-seam className="absolute inset-0 ring-1 ring-inset ring-black/25" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="aspect-[1280/854] overflow-hidden">
                <Photo name="gifts" alt="" sizes="(min-width: 1024px) 45vw, 100vw" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
