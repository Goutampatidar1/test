import { mediaUrlOnNodePort } from "../media.js";

export const DEFAULT_IMAGE_SRC = `${import.meta.env.BASE_URL || "/"}default-image.svg`.replace(
  /([^:]\/)\/+/g,
  "$1"
);

export function installBrokenImageFallback(placeholder = DEFAULT_IMAGE_SRC) {
  if (typeof document === "undefined") return;

  document.addEventListener(
    "error",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLImageElement)) return;
      if (el.dataset.fallbackApplied === "1") return;

      if (el.dataset.portRetry !== "1") {
        const retry = mediaUrlOnNodePort(el.currentSrc || el.getAttribute("src") || "");
        if (retry) {
          el.dataset.portRetry = "1";
          el.src = retry;
          return;
        }
      }

      el.dataset.fallbackApplied = "1";
      el.src = placeholder;
    },
    true
  );
}
