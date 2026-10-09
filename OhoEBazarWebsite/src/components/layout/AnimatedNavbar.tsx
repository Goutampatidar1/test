import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { BrandLogo } from "@/components/brand/BrandMark";
import { useI18n } from "@/i18n/LanguageProvider";
import type { Lang } from "@/i18n/dictionary";
import { cn } from "@/lib/utils";
import { useIntroDone } from "./PageTransition";
import { useSmoothScroll } from "./SmoothScroll";

const LINKS = [
  { id: "categories", key: "categories" },
  { id: "products", key: "products" },
  { id: "sellers", key: "sellers" },
  { id: "services", key: "services" },
  { id: "story", key: "story" },
] as const;

const EASE = [0.16, 1, 0.3, 1] as const;

function LanguageSwitch({ dark = false, className }: { dark?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n();
  const options: { value: Lang; label: string }[] = [
    { value: "hi", label: "हिन्दी" },
    { value: "en", label: "English" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t.a11y.language}
      className={cn(
        "relative flex items-center rounded-full p-1 text-[0.8rem] font-semibold",
        dark ? "bg-white/10 text-ivory" : "bg-charcoal/[0.06] text-charcoal",
        className,
      )}
    >
      {options.map((o) => {
        const active = lang === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            lang={o.value}
            onClick={() => setLang(o.value)}
            className={cn(
              "relative z-10 rounded-full px-3 py-1.5 transition-colors duration-300",
              active ? (dark ? "text-charcoal" : "text-ivory") : "opacity-70 hover:opacity-100",
            )}
          >
            {active && (
              <motion.span
                layoutId={dark ? "lang-pill-dark" : "lang-pill"}
                className={cn("absolute inset-0 -z-10 rounded-full", dark ? "bg-ivory" : "bg-charcoal")}
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

export function AnimatedNavbar() {
  const { t, lang } = useI18n();
  const { scrollTo, stop, start } = useSmoothScroll();
  const introDone = useIntroDone();
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [onDark, setOnDark] = useState(true);
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);

  // Sections declare `data-nav="dark" | "light"`; the last one in document order under the bar is the one on top.
  const probe = () => {
    let theme = null as string | null;
    document.querySelectorAll<HTMLElement>("[data-nav]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top <= 36 && r.bottom > 36) theme = el.dataset.nav ?? null;
    });
    setOnDark(theme === "dark");
  };

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setSolid(y > 40);
    setHidden(y > 640 && y > prev + 2 && !open);
    if (y < prev - 2) setHidden(false);
    probe();
  });

  useEffect(() => {
    probe();
  }, [introDone, lang]);

  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    stop();
    firstLink.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      start();
      window.removeEventListener("keydown", onKey);
      menuButton.current?.focus();
    };
  }, [open, stop, start]);

  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    window.setTimeout(() => scrollTo(`#${id}`), open ? 350 : 0);
  };

  const brand = lang === "hi" ? "ओहो ई-बाज़ार" : "OHO E-Bazar";

  return (
    <>
      <motion.header
        initial={{ y: -110, opacity: 0 }}
        animate={introDone ? { y: hidden ? -110 : 0, opacity: 1 } : { y: -110, opacity: 0 }}
        transition={{ duration: hidden ? 0.45 : 0.9, ease: EASE, delay: introDone && !solid && !hidden ? 0.05 : 0 }}
        className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5"
      >
        <nav
          aria-label="Primary"
          className={cn(
            "mx-auto flex max-w-[1440px] items-center justify-between gap-4 rounded-full py-2 pl-3 pr-2 transition-[background-color,box-shadow,backdrop-filter,color] duration-500",
            onDark ? "text-ivory" : "text-charcoal",
            solid &&
              (onDark
                ? "bg-night/55 ring-1 ring-white/10 backdrop-blur-xl"
                : "bg-ivory/85 shadow-[0_20px_50px_-30px_rgba(20,20,20,0.45)] ring-1 ring-charcoal/[0.06] backdrop-blur-xl"),
          )}
        >
          <a
            href="#top"
            onClick={go("top")}
            className="group flex items-center rounded-full pr-2"
            aria-label={brand}
          >
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={introDone ? { scale: 1, opacity: 1 } : undefined}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.2 }}
              className="inline-flex transition-transform duration-500 group-hover:scale-105"
            >
              <BrandLogo height="h-8 sm:h-9" />
            </motion.span>
          </a>

          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  onClick={go(l.id)}
                  aria-current={active === l.id ? "true" : undefined}
                  className={cn(
                    "group relative rounded-full px-3.5 py-2 text-[0.9rem] font-medium transition-colors",
                    active === l.id ? "opacity-100" : "opacity-65 hover:opacity-100",
                  )}
                >
                  {t.nav[l.key]}
                  <span
                    className={cn(
                      "absolute inset-x-3.5 bottom-1 h-px origin-left bg-oho transition-transform duration-500 ease-[var(--ease-expo)]",
                      active === l.id ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                    )}
                  />
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <LanguageSwitch dark={onDark} className="hidden sm:flex" />
            <a
              href="#categories"
              onClick={go("categories")}
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-4 py-2.5 text-[0.85rem] font-semibold transition-colors hover:bg-oho hover:text-white xl:inline-flex",
                onDark ? "bg-ivory text-charcoal" : "bg-charcoal text-ivory",
              )}
            >
              {t.nav.cta}
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
            <button
              ref={menuButton}
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t.a11y.openMenu}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className={cn(
                "grid size-11 place-items-center rounded-full lg:hidden",
                onDark ? "bg-ivory text-charcoal" : "bg-charcoal text-ivory",
              )}
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t.a11y.openMenu}
            initial={{ clipPath: "circle(0% at 92% 4%)" }}
            animate={{ clipPath: "circle(150% at 92% 4%)" }}
            exit={{ clipPath: "circle(0% at 92% 4%)" }}
            transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1] }}
            className="grain fixed inset-0 z-[60] flex flex-col bg-charcoal px-6 pb-8 pt-5 text-ivory lg:hidden"
          >
            <div className="relative z-10 flex items-center justify-between">
              <BrandLogo height="h-8" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.a11y.closeMenu}
                className="grid size-11 place-items-center rounded-full bg-ivory text-charcoal"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <ul className="relative z-10 mt-14 flex flex-1 flex-col gap-2">
              {LINKS.map((l, i) => (
                <li key={l.id} className="overflow-hidden">
                  <motion.a
                    ref={i === 0 ? firstLink : undefined}
                    href={`#${l.id}`}
                    onClick={go(l.id)}
                    initial={{ y: "105%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "105%" }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.15 + i * 0.06 }}
                    className="flex items-baseline gap-4 py-1 font-display text-[clamp(2.2rem,10vw,3.4rem)] leading-[1.2]"
                  >
                    <span className="font-sans text-xs text-ivory/40">0{i + 2}</span>
                    {t.nav[l.key]}
                  </motion.a>
                </li>
              ))}
            </ul>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-ivory/10 pt-6"
            >
              <LanguageSwitch dark />
              <a
                href="#categories"
                onClick={go("categories")}
                className="inline-flex items-center gap-1.5 rounded-full bg-oho px-5 py-3 text-sm font-semibold text-white"
              >
                {t.nav.cta}
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
