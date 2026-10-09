import Lenis from "lenis";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { gsap, ScrollTrigger } from "@/lib/gsap";

type ScrollTarget = string | number | HTMLElement;

type SmoothScrollContextValue = {
  scrollTo: (target: ScrollTarget, opts?: { offset?: number; immediate?: boolean }) => void;
  stop: () => void;
  start: () => void;
};

const SmoothScrollContext = createContext<SmoothScrollContextValue | null>(null);

/** Lenis smooth scrolling driven by the GSAP ticker so ScrollTrigger and Lenis share one frame loop. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener("load", refresh);
    return () => window.removeEventListener("load", refresh);
  }, []);

  const scrollTo = useCallback<SmoothScrollContextValue["scrollTo"]>(
    (target, opts) => {
      const offset = opts?.offset ?? 0;
      const lenis = lenisRef.current;
      if (lenis) {
        lenis.scrollTo(target, { offset, immediate: opts?.immediate, duration: 1.6 });
        return;
      }
      const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
      const top =
        typeof el === "number" ? el : el instanceof HTMLElement ? el.getBoundingClientRect().top + window.scrollY : 0;
      window.scrollTo({ top: top + offset, behavior: reduced || opts?.immediate ? "auto" : "smooth" });
    },
    [reduced],
  );

  const value = useMemo<SmoothScrollContextValue>(
    () => ({
      scrollTo,
      stop: () => lenisRef.current?.stop(),
      start: () => lenisRef.current?.start(),
    }),
    [scrollTo],
  );

  return <SmoothScrollContext.Provider value={value}>{children}</SmoothScrollContext.Provider>;
}

export function useSmoothScroll() {
  const ctx = useContext(SmoothScrollContext);
  if (!ctx) throw new Error("useSmoothScroll must be used inside SmoothScroll");
  return ctx;
}
