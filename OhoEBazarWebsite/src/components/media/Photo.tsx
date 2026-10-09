import type { ImgHTMLAttributes } from "react";
import { cutoutSrc, cutoutSrcSet, cutouts, photoMeta, photoSrc, photoSrcSet, type CutoutKey, type PhotoKey } from "@/lib/media";
import { cn } from "@/lib/utils";

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "width" | "height">;

type PhotoProps = ImgProps & {
  name: PhotoKey;
  alt: string;
  /** Responsive `sizes` hint; defaults to a half-viewport image. */
  sizes?: string;
  priority?: boolean;
};

/** Self-hosted art-directed photo with WebP srcset and intrinsic dimensions (no layout shift). */
export function Photo({ name, alt, sizes = "(min-width: 1024px) 50vw, 100vw", priority, className, ...rest }: PhotoProps) {
  const { width, height } = photoMeta(name);
  return (
    <img
      src={photoSrc(name)}
      srcSet={photoSrcSet(name)}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cn("block h-full w-full object-cover", className)}
      {...rest}
    />
  );
}

type CutoutProps = ImgProps & {
  name: CutoutKey;
  alt: string;
  sizes?: string;
  priority?: boolean;
};

/** Transparent product cutout (keyed studio shot). */
export function Cutout({ name, alt, sizes = "(min-width: 1024px) 24vw, 45vw", priority, className, ...rest }: CutoutProps) {
  const c = cutouts[name];
  return (
    <img
      src={cutoutSrc(name)}
      srcSet={cutoutSrcSet(name)}
      sizes={sizes}
      width={c.w}
      height={c.h}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn("block h-auto w-full select-none object-contain", className)}
      {...rest}
    />
  );
}

/** Remote API image (only used when it is a real upload, not a seed placeholder). */
export function RemoteImage({ src, alt, className, ...rest }: ImgProps & { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("block h-full w-full object-cover", className)}
      {...rest}
    />
  );
}
