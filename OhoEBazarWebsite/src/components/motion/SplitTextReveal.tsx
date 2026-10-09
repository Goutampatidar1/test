import { useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { Lines } from "@/i18n/dictionary";
import { gsap, useGsap } from "@/lib/gsap";
import { cn } from "@/lib/utils";

type SplitTextRevealProps = {
  lines: Lines;
  as?: "h1" | "h2" | "h3" | "p" | "div";
  id?: string;
  className?: string;
  lineClassName?: string;
  accentClassName?: string;
  /** `view` animates on scroll into view; `manual` leaves `.split-inner` for a parent timeline. */
  trigger?: "view" | "manual";
  stagger?: number;
  delay?: number;
};

/**
 * Masked word-by-word reveal. Splits on spaces only so Devanagari conjuncts and matras stay intact.
 * Screen readers get the full sentence through aria-label.
 */
export function SplitTextReveal({
  lines,
  as: Tag = "h2",
  id,
  className,
  lineClassName,
  accentClassName = "text-oho",
  trigger = "view",
  stagger = 0.055,
  delay = 0,
}: SplitTextRevealProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const label = lines.map((line) => line.map((s) => s.t).join("")).join(" ");

  useGsap(
    () => {
      if (trigger !== "view" || reduced || !ref.current) return;
      gsap.fromTo(
        ref.current.querySelectorAll(".split-inner"),
        { yPercent: 118, rotate: 3 },
        {
          yPercent: 0,
          rotate: 0,
          duration: 1.1,
          ease: "expo.out",
          stagger,
          delay,
          scrollTrigger: { trigger: ref.current, start: "top 86%", once: true },
        },
      );
    },
    [label, trigger, reduced],
    ref,
  );

  return (
    <Tag ref={ref} id={id} aria-label={label} className={className}>
      {lines.map((line, li) => (
        <span key={li} aria-hidden className={cn("block", lineClassName)}>
          {li > 0 && " "}
          {line.map((seg, si) =>
            seg.t.split(/(\s+)/).map((word, wi) =>
              /^\s+$/.test(word) || word === "" ? (
                word
              ) : (
                <span key={`${si}-${wi}`} className="split-mask">
                  <span className={cn("split-inner", seg.accent && accentClassName)}>{word}</span>
                </span>
              ),
            ),
          )}
        </span>
      ))}
    </Tag>
  );
}
