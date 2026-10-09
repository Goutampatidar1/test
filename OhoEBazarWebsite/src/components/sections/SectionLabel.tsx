import type { ReactNode } from "react";
import { formatIndex } from "@/i18n/dictionary";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/** Chapter marker shared by every section: index, hairline, name. */
export function SectionLabel({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  const { lang } = useI18n();
  return (
    <p className={cn("eyebrow flex items-center gap-3", className)}>
      <span className="font-display text-[0.95rem] tracking-normal text-oho">{formatIndex(index, lang)}</span>
      <span aria-hidden className="h-px w-10 bg-current opacity-30" />
      <span>{children}</span>
    </p>
  );
}
