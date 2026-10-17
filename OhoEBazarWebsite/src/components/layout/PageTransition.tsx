import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { gsap } from "@/lib/gsap";

const IntroContext = createContext(false);

/** True once the opening curtain has lifted and the hero may start its own timeline. */
export function useIntroDone() {
  return useContext(IntroContext);
}

/** Opening curtain: official oho-logo.png only (no SVG glyph), then panel lifts. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(reduced);
  const [gone, setGone] = useState(reduced);
  const rootRef = useRef<HTMLDivElement>(null);

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
      tl.from("[data-curtain-logo]", { scale: 0.92, opacity: 0, duration: 0.55, ease: "back.out(1.4)" })
        .to("[data-curtain-inner]", { y: -24, opacity: 0, duration: 0.35, ease: "power2.in" }, "+=0.35")
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
          <div data-curtain-inner className="flex flex-col items-center">
            <img
              data-curtain-logo
              src="/oho-logo.png"
              alt="OHO E-Bazar"
              width={420}
              height={165}
              className="h-20 w-auto max-w-[min(86vw,22rem)] rounded-2xl object-contain shadow-md ring-1 ring-black/10 sm:h-24"
              draggable={false}
            />
          </div>
        </div>
      )}
    </IntroContext.Provider>
  );
}
