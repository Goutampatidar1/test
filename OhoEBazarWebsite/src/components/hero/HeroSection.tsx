import { ArrowDown, ArrowRight } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { BrandGlyph } from "@/components/brand/BrandMark";
import { useIntroDone } from "@/components/layout/PageTransition";
import { useSmoothScroll } from "@/components/layout/SmoothScroll";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { SplitTextReveal } from "@/components/motion/SplitTextReveal";
import { useFinePointer, useIsDesktop } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useI18n } from "@/i18n/LanguageProvider";
import { gsap, useGsap } from "@/lib/gsap";
import { HeroStill } from "./HeroStill";

const HeroStage = lazy(() => import("./HeroStage"));

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class StageBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Lets a WebGL context loss fall back to the still life instead of leaving an empty stage. */
function StageErrorWatch({ onFail }: { onFail: () => void }) {
  useEffect(() => {
    const onLost = (e: Event) => {
      if ((e.target as HTMLElement | null)?.tagName === "CANVAS") onFail();
    };
    window.addEventListener("webglcontextlost", onLost, true);
    return () => window.removeEventListener("webglcontextlost", onLost, true);
  }, [onFail]);
  return null;
}

export function HeroSection() {
  const { t } = useI18n();
  const { scrollTo } = useSmoothScroll();
  const introDone = useIntroDone();
  const reduced = useReducedMotion();
  const desktop = useIsDesktop();
  const fine = useFinePointer();
  const webgl = useMemo(supportsWebGL, []);
  const [stageFailed, setStageFailed] = useState(false);
  const use3d = desktop && webgl && !reduced && !stageFailed;

  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });

  // Copy enters after the curtain; the 3D stage runs its own Theatre intro, the still life gets a matching DOM one.
  useGsap(
    () => {
      const root = rootRef.current;
      if (!root || reduced) return;
      const q = gsap.utils.selector(root);
      gsap.set(q(".split-inner"), { yPercent: 118 });
      gsap.set(q("[data-hero-fade]"), { opacity: 0, y: 24 });
      gsap.set(q("[data-still-item]"), { opacity: 0, scale: 0.88, y: 40 });
      gsap.set(q("[data-still-ribbon]"), { strokeDasharray: "0 1" });
      if (!introDone) return;

      const tl = gsap.timeline({ defaults: { ease: "expo.out" }, delay: use3d ? 0.5 : 0.2 });
      tl.to(q(".split-inner"), { yPercent: 0, duration: 1.3, stagger: 0.08 }, 0)
        .to(q("[data-hero-fade]"), { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.45)
        .to(q("[data-still-ribbon]"), { strokeDasharray: "1 0", duration: 2.4, ease: "power2.inOut" }, 0)
        .to(q("[data-still-item]"), { opacity: 1, scale: 1, y: 0, duration: 1.6, stagger: 0.18 }, 0.3);
    },
    [introDone, reduced, use3d],
    rootRef,
  );

  // Exit: the hero holds while the categories slide over it on their ribbon edge; the stage scrubs its Theatre exit.
  useGsap(
    () => {
      const root = rootRef.current;
      if (!root || reduced || !desktop) return;
      const q = gsap.utils.selector(root);
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom top",
          pin: true,
          pinSpacing: false,
          scrub: 0.5,
          onUpdate: (self) => {
            progressRef.current = self.progress;
          },
        },
      });
      tl.to(q("[data-hero-copy]"), { yPercent: -18, opacity: 0, duration: 0.55 }, 0).to(q("[data-hero-bottom]"), { opacity: 0, duration: 0.25 }, 0);
      if (!use3d) tl.to(q("[data-still-item]"), { yPercent: -30, opacity: 0, stagger: 0.05, duration: 0.6 }, 0);
    },
    [reduced, desktop, use3d],
    rootRef,
  );

  useEffect(() => {
    if (!use3d || !fine) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [use3d, fine]);

  const go = (target: string) => (e: MouseEvent) => {
    e.preventDefault();
    scrollTo(target);
  };

  const desktopStill = <HeroStill className="absolute right-[3vw] top-1/2 h-[min(74vh,46rem)] w-[50vw] -translate-y-1/2" />;

  return (
    <section
      ref={rootRef}
      id="top"
      data-nav="dark"
      aria-labelledby="hero-title"
      className="relative h-[100svh] min-h-[640px] overflow-hidden bg-night text-ivory"
    >
      {use3d ? (
        <StageBoundary fallback={desktopStill}>
          <Suspense fallback={null}>
            <StageErrorWatch onFail={() => setStageFailed(true)} />
            <HeroStage progressRef={progressRef} pointerRef={pointerRef} play={introDone} eventSource={rootRef} />
          </Suspense>
        </StageBoundary>
      ) : (
        desktop && desktopStill
      )}

      <div data-hero-copy className="pointer-events-none frame relative z-10 flex h-full flex-col pt-28 lg:justify-center lg:pt-6">
        <div className="pointer-events-auto max-w-[36rem] lg:w-[44%] lg:max-w-none">
          <p data-hero-fade className="eyebrow mb-7 flex items-center gap-3 text-ivory/60">
            <BrandGlyph className="size-6" />
            {t.hero.eyebrow}
          </p>
          <SplitTextReveal
            as="h1"
            id="hero-title"
            trigger="manual"
            lines={t.hero.lines}
            className="t-display text-[clamp(2.6rem,4.7vw,5rem)] font-medium text-ivory [html[lang=en]_&]:text-[clamp(2.4rem,3.8vw,4.1rem)]"
            accentClassName="text-oho"
          />
          <p data-hero-fade className="t-lead mt-7 max-w-[29rem] text-ivory/70">
            {t.hero.sub}
          </p>
          <div data-hero-fade className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <MagneticButton href="#categories" onClick={go("#categories")} icon={<ArrowRight className="size-4" />}>
              {t.hero.primary}
            </MagneticButton>
            <a
              href="#story"
              onClick={go("#story")}
              className="group inline-flex items-center gap-2 py-2 text-[0.95rem] font-medium text-ivory/80 transition-colors hover:text-ivory"
            >
              <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-500 group-hover:bg-[length:100%_1px]">
                {t.hero.secondary}
              </span>
            </a>
          </div>
        </div>
        {!desktop && <HeroStill className="relative -mx-2 mb-[4svh] mt-6 min-h-0 flex-1" />}
      </div>

      <div data-hero-bottom className="frame pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden items-end justify-between pb-8 lg:flex">
        <a
          data-hero-fade
          href="#categories"
          onClick={go("#categories")}
          className="pointer-events-auto group flex items-center gap-3 text-sm font-medium text-ivory/60 transition-colors hover:text-ivory"
        >
          <span className="relative grid size-11 place-items-center overflow-hidden rounded-full border border-ivory/20">
            <ArrowDown className="size-4 transition-transform duration-500 group-hover:translate-y-8" />
            <ArrowDown className="absolute size-4 -translate-y-8 transition-transform duration-500 group-hover:translate-y-0" />
          </span>
          {t.hero.scroll}
        </a>
        <p data-hero-fade className="text-xs text-ivory/40">
          {t.hero.caption}
        </p>
      </div>
    </section>
  );
}
