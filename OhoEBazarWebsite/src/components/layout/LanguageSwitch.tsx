import { motion } from "motion/react";
import { useId } from "react";
import type { Lang } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: "hi", label: "हिन्दी" },
  { lang: "en", label: "English" },
];

export function LanguageSwitch({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const { lang, setLang, t } = useI18n();
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={t.a11y.language}
      className={cn(
        "relative flex rounded-full p-1 text-[0.8rem] font-semibold",
        tone === "light" ? "bg-charcoal/[0.06] text-charcoal" : "bg-white/10 text-ivory",
        className,
      )}
    >
      {OPTIONS.map((o) => {
        const active = o.lang === lang;
        return (
          <button
            key={o.lang}
            type="button"
            role="radio"
            aria-checked={active}
            lang={o.lang}
            onClick={() => setLang(o.lang)}
            className={cn(
              "relative z-10 rounded-full px-3 py-1.5 transition-colors duration-300",
              active ? (tone === "light" ? "text-ivory" : "text-charcoal") : "opacity-70 hover:opacity-100",
            )}
          >
            {active && (
              <motion.span
                layoutId={`lang-pill-${id}`}
                className={cn("absolute inset-0 -z-10 rounded-full", tone === "light" ? "bg-charcoal" : "bg-ivory")}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
