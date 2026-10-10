import { motion, useMotionValue, useSpring, type HTMLMotionProps } from "motion/react";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { useFinePointer } from "@/hooks/useMediaQuery";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-oho text-white shadow-[0_18px_40px_-18px_rgba(254,112,0,0.9)] hover:bg-oho-deep",
  dark: "bg-charcoal text-ivory hover:bg-ink",
  light: "bg-ivory text-charcoal hover:bg-white",
  ghost: "border border-current/25 text-current hover:border-current/60",
} as const;

type MagneticButtonProps = Omit<HTMLMotionProps<"a">, "children" | "ref" | "style"> & {
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  strength?: number;
  icon?: ReactNode;
};

/** Pill CTA that leans toward the cursor; the label follows a little further for depth. */
export function MagneticButton({
  children,
  variant = "primary",
  strength = 0.35,
  icon,
  className,
  ...rest
}: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const active = fine && !reduced;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 15, mass: 0.3 });
  const sy = useSpring(y, { stiffness: 220, damping: 15, mass: 0.3 });
  const lx = useSpring(useMotionValue(0), { stiffness: 220, damping: 15 });
  const ly = useSpring(useMotionValue(0), { stiffness: 220, damping: 15 });

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (!active || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    x.set(dx * strength);
    y.set(dy * strength);
    lx.set(dx * strength * 0.35);
    ly.set(dy * strength * 0.35);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
    lx.set(0);
    ly.set(0);
  };

  return (
    <motion.a
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={active ? { x: sx, y: sy } : undefined}
      className={cn(
        "group relative inline-flex min-h-12 items-center justify-center gap-2.5 overflow-hidden rounded-full px-5 py-3.5 text-[0.92rem] sm:px-7 sm:text-[0.95rem] font-semibold transition-colors duration-300",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <motion.span style={active ? { x: lx, y: ly } : undefined} className="relative z-10 inline-flex items-center gap-2.5">
        {children}
        {icon && (
          <span className="inline-grid size-6 place-items-center overflow-hidden" aria-hidden>
            <span className="col-start-1 row-start-1 transition-transform duration-500 ease-[var(--ease-expo)] group-hover:translate-x-6">
              {icon}
            </span>
            <span className="col-start-1 row-start-1 -translate-x-6 transition-transform duration-500 ease-[var(--ease-expo)] group-hover:translate-x-0">
              {icon}
            </span>
          </span>
        )}
      </motion.span>
    </motion.a>
  );
}
