import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BrandGlyph } from "@/components/brand/BrandMark";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useI18n } from "@/i18n/LanguageProvider";
import { gsap } from "@/lib/gsap";

const IntroContext = createContext(false);

/** True once the opening curtain has lifted and the hero may start its own timeline. */
export function useIntroDone() {
  return useContext(IntroContext);
}

/** Opening curtain: brand glyph assembles, then the panel lifts with a curved edge to reveal the page. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(reduced);
  const [gone, setGone] = useState(reduced);
  const rootRef = useRef<HTMLDivElement>(null);
  const { lang } = useI18n();

  useEffect(() => {
    if (reduced) {
      setDone(true);
      setGone(true);
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    document.documentElement.style.overflow = "hidden";
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.1 });
      tl.from("[data-glyph-body]", { scale: 0, transformOrigin: "50% 50%", duration: 0.5, ease: "back.out(1.8)" })
        .from("[data-glyph-flap]", { xPercent: -60, opacity: 0, duration: 0.35, ease: "expo.out" }, "-=0.25")
        .from("[data-glyph-o]", { scale: 0.2, opacity: 0, transformOrigin: "50% 50%", duration: 0.3 }, "-=0.2")
        .from("[data-curtain-word]", { yPercent: 120, duration: 0.6, ease: "expo.out" }, "-=0.3")
        .to("[data-curtain-inner]", { y: -30, opacity: 0, duration: 0.35, ease: "power2.in" }, "+=0.1")
        .add(() => {
          document.documentElement.style.overflow = "";
          setDone(true);
        })
        .to(root, { clipPath: "ellipse(140% 0% at 50% 0%)", duration: 0.95, ease: "expo.inOut" }, "<-0.05")
        .add(() => setGone(true));
    }, root);
    return () => {
      document.documentElement.style.overflow = "";
      ctx.revert();
    };
  }, [reduced]);

  return (
    <IntroContext.Provider value={done}>
      {children}
      {!gone && (
        <div
          ref={rootRef}
          aria-hidden
          className="fixed inset-0 z-[100] grid place-items-center bg-ivory text-charcoal"
          style={{ clipPath: "ellipse(140% 140% at 50% 0%)" }}
        >
          <div data-curtain-inner className="flex flex-col items-center gap-5">
            <BrandGlyph className="size-16" />
            <span className="overflow-hidden px-2 pb-1">
              <span data-curtain-word className="block font-display text-2xl tracking-tight">
                {lang === "hi" ? "ओहो ई-बाज़ार" : "OHO E-Bazar"}
              </span>
            </span>
          </div>
        </div>
      )}
    </IntroContext.Provider>
  );
}
