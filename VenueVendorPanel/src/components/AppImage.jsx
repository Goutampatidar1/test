import { useEffect, useState } from "react";
import { mediaUrl, mediaUrlOnNodePort } from "../media.js";
import { DEFAULT_IMAGE_SRC } from "../utils/imageFallback.js";

function probe(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * Resolves upload URLs with Apache → Node :5001 fallback when /uploads 404s.
 */
export function AppImage({ src, alt = "", className, width, height, style, ...rest }) {
  const [current, setCurrent] = useState(() => mediaUrl(src) || DEFAULT_IMAGE_SRC);

  useEffect(() => {
    let cancelled = false;
    const primary = mediaUrl(src) || DEFAULT_IMAGE_SRC;
    setCurrent(primary);

    if (!src || primary === DEFAULT_IMAGE_SRC || primary.startsWith("blob:") || primary.startsWith("data:")) {
      return undefined;
    }

    (async () => {
      if (await probe(primary)) {
        if (!cancelled) setCurrent(primary);
        return;
      }
      const retry = mediaUrlOnNodePort(primary);
      if (retry && (await probe(retry))) {
        if (!cancelled) setCurrent(retry);
        return;
      }
      if (!cancelled) setCurrent(DEFAULT_IMAGE_SRC);
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <img
      src={current || DEFAULT_IMAGE_SRC}
      alt={alt}
      className={className}
      width={width}
      height={height}
      style={style}
      onError={() => {
        const retry = mediaUrlOnNodePort(current);
        if (retry && current !== retry && current !== DEFAULT_IMAGE_SRC) {
          setCurrent(retry);
          return;
        }
        if (current !== DEFAULT_IMAGE_SRC) setCurrent(DEFAULT_IMAGE_SRC);
      }}
      {...rest}
    />
  );
}
