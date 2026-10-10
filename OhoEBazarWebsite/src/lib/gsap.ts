import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, type DependencyList, type RefObject } from "react";

gsap.registerPlugin(ScrollTrigger);
gsap.defaults({ ease: "power3.out" });
// Section selectors are shared between the WebGL and DOM hero variants, so some are legitimately empty.
gsap.config({ nullTargetWarn: false });
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };

/**
 * Runs GSAP setup inside a scoped context and reverts every tween/trigger it created on cleanup.
 * The callback may return its own cleanup for non-GSAP listeners.
 */
export function useGsap(
  setup: (ctx: gsap.Context) => void | (() => void),
  deps: DependencyList,
  scope?: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    let extra: void | (() => void);
    const ctx = gsap.context((self) => {
      extra = setup(self);
    }, scope?.current ?? undefined);
    return () => {
      extra?.();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
