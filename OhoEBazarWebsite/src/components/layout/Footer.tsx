import { ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { useI18n } from "@/i18n/LanguageProvider";
import { VENDOR_PANEL_URL } from "@/lib/api";
import { photoCredits } from "@/lib/media";
import type { AppConfig, PublicCategory } from "@/lib/types";
import { useSmoothScroll } from "./SmoothScroll";

type FooterProps = {
  config: AppConfig | null;
  ecomCategories: PublicCategory[];
  venueCategories: PublicCategory[];
};

const SOCIALS = ["facebook", "instagram", "twitter", "linkedin"] as const;

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-5 text-ivory/45">{title}</h3>
      <ul className="space-y-2.5 text-[0.95rem] text-ivory/80">{children}</ul>
    </div>
  );
}

const linkClass = "transition-colors hover:text-oho focus-visible:text-oho";

export function Footer({ config, ecomCategories, venueCategories }: FooterProps) {
  const { t, lang, categoryName } = useI18n();
  const { scrollTo } = useSmoothScroll();
  const brand = lang === "hi" ? "ओहो ई-बाज़ार" : "OHO E-Bazar";
  const year = new Date().getFullYear();
  const socials = SOCIALS.filter((s) => config?.[s]?.trim());

  const go = (target: string) => (e: MouseEvent) => {
    e.preventDefault();
    scrollTo(target);
  };

  return (
    <footer data-nav="dark" className="relative z-10 -mt-px overflow-hidden bg-night px-5 pb-8 pt-20 text-ivory sm:px-8 lg:px-12">
      <span aria-hidden className="absolute inset-x-5 top-0 h-px bg-ivory/10 sm:inset-x-8 lg:inset-x-12" />
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 border-b border-ivory/10 pb-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
          <div className="max-w-sm">
            <BrandMark label={brand} tone="light" />
            <p className="mt-5 font-display text-xl leading-snug text-ivory">{t.footer.tagline}</p>
            {config?.app_details && <p className="mt-4 text-sm leading-relaxed text-ivory/55">{config.app_details}</p>}
          </div>

          {ecomCategories.length > 0 && (
            <FooterColumn title={t.footer.shop}>
              {ecomCategories.slice(0, 7).map((c) => (
                <li key={c._id}>
                  <a href="#categories" onClick={go("#categories")} className={linkClass}>
                    {categoryName(c.name)}
                  </a>
                </li>
              ))}
            </FooterColumn>
          )}

          {venueCategories.length > 0 && (
            <FooterColumn title={t.footer.services}>
              {venueCategories.slice(0, 7).map((c) => (
                <li key={c._id}>
                  <a href="#services" onClick={go("#services")} className={linkClass}>
                    {categoryName(c.name)}
                  </a>
                </li>
              ))}
            </FooterColumn>
          )}

          <FooterColumn title={t.footer.sellers}>
            <li>
              <a href={`${VENDOR_PANEL_URL}/vendor/login`} target="_blank" rel="noopener" className={linkClass}>
                {t.footer.sellerLogin}
              </a>
            </li>
            <li>
              <a href={`${VENDOR_PANEL_URL}/vendor/register`} target="_blank" rel="noopener" className={linkClass}>
                {t.footer.sellerRegister}
              </a>
            </li>
          </FooterColumn>

          {(config?.app_email || config?.app_mobile || config?.address) && (
            <FooterColumn title={t.footer.contact}>
              {config.app_email && (
                <li>
                  <a href={`mailto:${config.app_email}`} className={`inline-flex items-center gap-2.5 ${linkClass}`}>
                    <Mail className="size-4 text-oho" aria-hidden />
                    {config.app_email}
                  </a>
                </li>
              )}
              {config.app_mobile && (
                <li>
                  <a href={`tel:${config.app_mobile.replace(/[^\d+]/g, "")}`} className={`inline-flex items-center gap-2.5 ${linkClass}`}>
                    <Phone className="size-4 text-oho" aria-hidden />
                    {config.app_mobile}
                  </a>
                </li>
              )}
              {config.address && (
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-1 size-4 shrink-0 text-oho" aria-hidden />
                  <span>{config.address}</span>
                </li>
              )}
              {socials.map((s) => (
                <li key={s}>
                  <a href={config[s]} target="_blank" rel="noopener noreferrer" className={`capitalize ${linkClass}`}>
                    {s}
                  </a>
                </li>
              ))}
            </FooterColumn>
          )}
        </div>

        <details className="group border-b border-ivory/10 py-5 text-sm text-ivory/55">
          <summary className="cursor-pointer list-none font-medium text-ivory/75 marker:hidden hover:text-ivory">
            <span className="inline-flex items-center gap-2">
              {t.footer.credits}
              <span aria-hidden className="transition-transform group-open:rotate-45">+</span>
            </span>
          </summary>
          <p className="mt-4 max-w-3xl">{t.footer.creditsNote}</p>
          <ul className="mt-4 grid gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {photoCredits.map((c) => (
              <li key={c.name}>
                <a href={c.source} target="_blank" rel="noopener noreferrer" className="hover:text-ivory">
                  {c.name.replace(/-/g, " ")}
                </a>{" "}
                — {c.author}, {c.license}
              </li>
            ))}
          </ul>
        </details>

        <div
          aria-hidden
          className="select-none whitespace-nowrap py-6 text-center font-display text-[clamp(3rem,13.5vw,13rem)] font-semibold leading-[1.1] text-ivory/[0.06]"
        >
          {brand}
        </div>

        <div className="flex flex-col items-start justify-between gap-4 text-sm text-ivory/50 sm:flex-row sm:items-center">
          <p>
            © {year} {config?.app_name ?? brand}. {t.footer.rights}
          </p>
          <a href="#top" onClick={go("#top")} className={`inline-flex items-center gap-2 ${linkClass}`}>
            {t.footer.top}
            <ArrowUp className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
