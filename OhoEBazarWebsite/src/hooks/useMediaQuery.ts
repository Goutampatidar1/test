import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Large screens with a fine pointer get pinned/horizontal choreography. */
export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}

export function useFinePointer() {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
