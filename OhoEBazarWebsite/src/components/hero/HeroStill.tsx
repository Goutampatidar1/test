import { Cutout } from "@/components/media/Photo";
import { cn } from "@/lib/utils";
import { HERO_PRODUCTS } from "./heroScene";

const RIBBON = "M -8 86 C 18 97, 58 95, 82 74 C 102 54, 94 20, 64 13 C 36 7, 9 27, 15 50 C 20 70, 48 66, 68 44 C 82 28, 98 8, 112 -6";

/** Still-life version of the hero stage for touch devices, reduced motion and browsers without WebGL. */
export function HeroStill({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none", className)}>
      <div className="relative mx-auto aspect-square h-full max-h-full max-w-full">
        <div className="absolute inset-[-12%] animate-glow rounded-full bg-[radial-gradient(closest-side,rgba(255,122,26,0.28),rgba(255,122,26,0)_72%)]" />
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id="hero-ribbon" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#7a2400" />
              <stop offset="0.45" stopColor="#fe7000" />
              <stop offset="1" stopColor="#ffb35c" />
            </linearGradient>
          </defs>
          <path data-still-ribbon d={RIBBON} fill="none" stroke="url(#hero-ribbon)" strokeWidth="2.2" strokeLinecap="round" pathLength={1} />
        </svg>
        {HERO_PRODUCTS.map((p) => (
          <div
            key={p.key}
            data-still-item
            className="absolute"
            style={{ left: `${p.still.left}%`, top: `${p.still.top}%`, width: `${p.still.width}%`, zIndex: p.still.z }}
          >
            <div className="animate-float" style={{ ["--float-rot" as string]: `${p.still.rot * 0.2}deg`, animationDelay: `${-p.phase}s` }}>
              <Cutout
                name={p.key}
                alt=""
                priority={p.main}
                sizes={p.main ? "(min-width: 1024px) 26vw, 56vw" : "(min-width: 1024px) 12vw, 30vw"}
                style={{ rotate: `${p.still.rot}deg` }}
                className="[-webkit-box-reflect:below_2px_linear-gradient(transparent_72%,rgba(0,0,0,0.22))]"
              />
            </div>
          </div>
        ))}
        <svg viewBox="0 0 100 100" className="absolute inset-0 z-[4] size-full overflow-visible">
          <path
            data-still-ribbon-front
            d={RIBBON}
            fill="none"
            stroke="url(#hero-ribbon)"
            strokeWidth="2.2"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="0.2 1"
          />
        </svg>
      </div>
    </div>
  );
}
