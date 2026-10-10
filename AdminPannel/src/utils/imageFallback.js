import { mediaUrl, mediaUrlOnNodePort } from "../media.js";

/** Resolved against the Vite base, so it works when the panel is served from /admin/. */
export const DEFAULT_IMAGE_SRC = `${import.meta.env.BASE_URL || "/"}default-image.svg`;

export function imageOrDefault(path) {
  return mediaUrl(path) || DEFAULT_IMAGE_SRC;
}

function isPlaceholder(src, placeholder) {
  if (!src) return false;
  try {
    return new URL(src, window.location.href).pathname === new URL(placeholder, window.location.href).pathname;
  } catch {
    return src === placeholder;
  }
}

export function installBrokenImageFallback(placeholder = DEFAULT_IMAGE_SRC) {
  if (typeof document === "undefined") return;

  document.addEventListener(
    "error",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLImageElement)) return;

      const src = el.getAttribute("src") || "";
      if (isPlaceholder(src, placeholder)) return;

      if (src && el.dataset.retriedSrc !== src) {
        const retry = mediaUrlOnNodePort(src);
        if (retry && retry !== src) {
          el.dataset.retriedSrc = retry;
          el.src = retry;
          return;
        }
      }

      el.src = placeholder;
    },
    true
  );
}
