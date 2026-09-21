const { getPublicBaseUrl, toAbsoluteUploadUrl } = require("./mediaUrl");

const STATIC_PAGE_APPS = ["user", "vendor", "venue_vendor", "delivery"];

const STATIC_PAGE_APP_LABELS = {
  user: "User App",
  vendor: "Vendor App",
  venue_vendor: "Venue Vendor App",
  delivery: "Delivery Partner App",
};

function normalizeStaticPageApp(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (key === "venuevendor" || key === "venue") return "venue_vendor";
  if (key === "delivery_partner" || key === "deliverypartner" || key === "delivery_boy" || key === "deliveryboy") {
    return "delivery";
  }
  if (STATIC_PAGE_APPS.includes(key)) return key;
  return null;
}

function slugifyStaticPageTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeStaticPageSlug(value, fallbackTitle = "") {
  const fromValue = slugifyStaticPageTitle(value);
  if (fromValue) return fromValue;
  return slugifyStaticPageTitle(fallbackTitle);
}

function buildStaticPageAppFilter(app) {
  const normalizedApp = normalizeStaticPageApp(app);
  if (!normalizedApp) return null;

  if (normalizedApp === "user") {
    return {
      $or: [{ app: "user" }, { app: { $exists: false } }, { app: null }, { app: "" }],
    };
  }

  return { app: normalizedApp };
}

async function findActiveStaticPage(PageModel, app, slug) {
  const normalizedSlug = normalizeStaticPageSlug(slug);
  const normalizedApp = normalizeStaticPageApp(app) || "user";
  if (!normalizedSlug) return null;

  const appFilter = buildStaticPageAppFilter(normalizedApp);
  if (!appFilter) return null;

  return PageModel.findOne({
    slug: normalizedSlug,
    status: "active",
    ...appFilter,
  }).lean();
}

async function ensureStaticPagesHaveApp(PageModel) {
  await PageModel.updateMany(
    { $or: [{ app: { $exists: false } }, { app: null }, { app: "" }] },
    { $set: { app: "user" } }
  );
}

function buildStaticPageApiUrl(baseUrl, app, slug) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  const normalizedApp = normalizeStaticPageApp(app);
  const normalizedSlug = normalizeStaticPageSlug(slug);
  if (!base || !normalizedApp || !normalizedSlug) return "";
  return `${base}/api/public/pages/${encodeURIComponent(normalizedSlug)}?app=${encodeURIComponent(normalizedApp)}`;
}

function buildStaticPageViewUrl(baseUrl, app, slug) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  const normalizedApp = normalizeStaticPageApp(app);
  const normalizedSlug = normalizeStaticPageSlug(slug);
  if (!base || !normalizedApp || !normalizedSlug) return "";
  return `${base}/view/${encodeURIComponent(normalizedApp)}/${encodeURIComponent(normalizedSlug)}`;
}

function attachStaticPageUrls(page, baseUrl) {
  if (!page) return null;
  const app = normalizeStaticPageApp(page.app) || "user";
  const slug = normalizeStaticPageSlug(page.slug);
  return {
    ...page,
    app,
    appLabel: STATIC_PAGE_APP_LABELS[app] || app,
    apiUrl: buildStaticPageApiUrl(baseUrl, app, slug),
    viewUrl: buildStaticPageViewUrl(baseUrl, app, slug),
  };
}

function toPublicStaticPage(page) {
  if (!page) return null;
  return {
    _id: page._id,
    title: page.title,
    slug: page.slug,
    content: page.content,
    app: normalizeStaticPageApp(page.app) || "user",
    updatedAt: page.updatedAt,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSocialLinks(branding) {
  const links = [
    { key: "facebook", label: "Facebook" },
    { key: "instagram", label: "Instagram" },
    { key: "twitter", label: "Twitter" },
    { key: "linkedin", label: "LinkedIn" },
  ];

  const items = links
    .filter((item) => String(branding?.[item.key] || "").trim())
    .map(
      (item) =>
        `<a href="${escapeHtml(branding[item.key])}" target="_blank" rel="noopener noreferrer">${item.label}</a>`
    );

  if (!items.length) return "";
  return `<div class="static-footer__social">${items.join("")}</div>`;
}

async function getStaticPageBranding(app, baseUrl) {
  const { AppConfig } = require("../models");
  const config = await AppConfig.findOne()
    .select("app_name app_email app_mobile address user_logo admin_logo favicon app_footer_text facebook twitter instagram linkedin")
    .lean();

  const appName = String(config?.app_name || "OHO E-BAZAR").trim();
  const normalizedApp = normalizeStaticPageApp(app) || "user";
  const logoPath =
    normalizedApp === "user"
      ? config?.user_logo || config?.admin_logo
      : config?.admin_logo || config?.user_logo;
  const faviconPath = config?.favicon || logoPath;
  const year = new Date().getFullYear();
  const defaultFooter = `© ${year} ${appName}. All rights reserved.`;

  return {
    appName,
    appLabel: STATIC_PAGE_APP_LABELS[normalizedApp] || appName,
    logoUrl: logoPath ? toAbsoluteUploadUrl(logoPath, baseUrl) : "",
    faviconUrl: faviconPath ? toAbsoluteUploadUrl(faviconPath, baseUrl) : "",
    footerText: String(config?.app_footer_text || defaultFooter).trim() || defaultFooter,
    email: String(config?.app_email || "").trim(),
    mobile: String(config?.app_mobile || "").trim(),
    address: String(config?.address || "").trim(),
    facebook: String(config?.facebook || "").trim(),
    twitter: String(config?.twitter || "").trim(),
    instagram: String(config?.instagram || "").trim(),
    linkedin: String(config?.linkedin || "").trim(),
    year,
  };
}

function hasCustomLayoutHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length > 0;
}

function renderDefaultHeaderInner(branding) {
  const appName = escapeHtml(branding.appName || "OHO E-BAZAR");
  const appLabel = escapeHtml(branding.appLabel || branding.appName || "App");
  const logoUrl = escapeHtml(branding.logoUrl || "");
  const logoMarkup = logoUrl
    ? `<img class="static-header__logo" src="${logoUrl}" alt="${appName}" />`
    : `<div class="static-header__logo-fallback" aria-hidden="true">${appName.charAt(0)}</div>`;

  return `<div class="static-header__brand">
          ${logoMarkup}
          <div class="static-header__titles">
            <p class="static-header__app">${appName}</p>
            <p class="static-header__tag">${appLabel}</p>
          </div>
        </div>
        <div class="static-header__badge">Information</div>`;
}

function renderDefaultFooterInner(branding) {
  const appName = escapeHtml(branding.appName || "OHO E-BAZAR");
  const appLabel = escapeHtml(branding.appLabel || branding.appName || "App");
  const footerText = escapeHtml(
    branding.footerText || `© ${branding.year || new Date().getFullYear()} ${appName}`
  );
  const logoUrl = escapeHtml(branding.logoUrl || "");
  const email = escapeHtml(branding.email || "");
  const mobile = escapeHtml(branding.mobile || "");
  const address = escapeHtml(branding.address || "");

  const logoMarkup = logoUrl
    ? `<img class="static-header__logo" src="${logoUrl}" alt="${appName}" />`
    : `<div class="static-header__logo-fallback" aria-hidden="true">${appName.charAt(0)}</div>`;

  const contactItems = [];
  if (email) contactItems.push(`<a href="mailto:${email}">${email}</a>`);
  if (mobile) contactItems.push(`<a href="tel:${mobile}">${mobile}</a>`);
  const contactMarkup = contactItems.length
    ? `<div class="static-footer__contact">${contactItems.join('<span class="static-footer__dot">•</span>')}</div>`
    : "";
  const addressMarkup = address ? `<p class="static-footer__address">${address}</p>` : "";
  const socialMarkup = renderSocialLinks(branding);

  return `<div class="static-footer__top">
          <div class="static-footer__brand">
            ${logoMarkup}
            <div>
              <p class="static-footer__brand-name">${appName}</p>
              <p class="static-footer__brand-tag">${appLabel}</p>
            </div>
          </div>
          <p class="static-footer__text">${footerText}</p>
          ${addressMarkup}
          ${contactMarkup}
          ${socialMarkup}
        </div>
        <div class="static-footer__bottom">${footerText}</div>`;
}

function renderStaticPageHtml(page, baseUrl, options = {}) {
  const branding = options.branding || (options.appName ? options : {});
  const layout = options.layout || {};
  const title = escapeHtml(page?.title || "Page");
  const content = String(page?.content || "");
  const safeBase = escapeHtml(baseUrl || "");
  const appName = escapeHtml(branding.appName || "OHO E-BAZAR");
  const faviconUrl = escapeHtml(branding.faviconUrl || branding.logoUrl || "");
  const faviconMarkup = faviconUrl ? `<link rel="icon" href="${faviconUrl}" />` : "";

  const headerInner = hasCustomLayoutHtml(layout.headerContent)
    ? `<div class="static-header__custom">${layout.headerContent}</div>`
    : renderDefaultHeaderInner(branding);

  const footerInner = hasCustomLayoutHtml(layout.footerContent)
    ? `<div class="static-footer__custom">${layout.footerContent}</div>`
    : renderDefaultFooterInner(branding);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#f97316" />
  <base href="${safeBase}/" />
  <title>${title} | ${appName}</title>
  ${faviconMarkup}
  <style>
    :root {
      --brand: #f97316;
      --brand-dark: #ea580c;
      --brand-soft: #fff7ed;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #ffffff;
      --footer-bg: #111827;
      --footer-text: #e5e7eb;
      --shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      --radius: 16px;
      --header-h: 64px;
    }

    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 16px;
      line-height: 1.65;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(249, 115, 22, 0.08), transparent 28%),
        linear-gradient(180deg, #fff7ed 0%, #ffffff 180px);
    }

    a { color: var(--brand-dark); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .static-shell {
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .static-header {
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: blur(12px);
      background: rgba(255, 255, 255, 0.92);
      border-bottom: 1px solid rgba(229, 231, 235, 0.95);
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
    }

    .static-header__inner,
    .static-main__inner,
    .static-footer__inner {
      width: min(920px, calc(100% - 32px));
      margin: 0 auto;
    }

    .static-header__inner {
      min-height: var(--header-h);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
    }

    .static-header__brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .static-header__logo {
      width: 42px;
      height: 42px;
      object-fit: contain;
      border-radius: 12px;
      background: #fff;
      border: 1px solid var(--border);
      padding: 4px;
      flex: 0 0 auto;
    }

    .static-header__logo-fallback {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--brand), var(--brand-dark));
      color: #fff;
      font-weight: 700;
      font-size: 1rem;
      flex: 0 0 auto;
    }

    .static-header__titles {
      min-width: 0;
    }

    .static-header__app {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .static-header__tag {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--muted);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .static-header__badge {
      flex: 0 0 auto;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--brand-soft);
      color: var(--brand-dark);
      font-size: 0.78rem;
      font-weight: 600;
      border: 1px solid #ffedd5;
      white-space: nowrap;
    }

    .static-main {
      flex: 1 0 auto;
      padding: 24px 0 40px;
    }

    .static-hero {
      margin-bottom: 18px;
      padding: 22px 24px;
      border-radius: var(--radius);
      background: linear-gradient(135deg, #fff7ed 0%, #ffffff 70%);
      border: 1px solid #ffedd5;
      box-shadow: var(--shadow);
    }

    .static-hero__eyebrow {
      display: inline-block;
      margin-bottom: 8px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--brand-dark);
    }

    .static-hero__title {
      margin: 0;
      font-size: clamp(1.5rem, 4vw, 2rem);
      line-height: 1.25;
      color: #111827;
    }

    .static-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .static-card__body {
      padding: 24px;
    }

    .static-page-content {
      color: var(--text);
      word-break: break-word;
    }

    .static-page-content > :first-child { margin-top: 0; }
    .static-page-content > :last-child { margin-bottom: 0; }

    .static-page-content h1,
    .static-page-content h2,
    .static-page-content h3,
    .static-page-content h4 {
      color: #111827;
      line-height: 1.35;
      margin: 1.4em 0 0.6em;
    }

    .static-page-content p,
    .static-page-content ul,
    .static-page-content ol,
    .static-page-content blockquote {
      margin: 0 0 1em;
    }

    .static-page-content img {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
    }

    .static-page-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 0.95rem;
    }

    .static-page-content th,
    .static-page-content td {
      border: 1px solid var(--border);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }

    .static-page-content blockquote {
      padding: 12px 16px;
      border-left: 4px solid var(--brand);
      background: #fff7ed;
      border-radius: 0 12px 12px 0;
    }

    .static-footer {
      margin-top: auto;
      background: var(--footer-bg);
      color: var(--footer-text);
      padding: 28px 0 calc(28px + env(safe-area-inset-bottom));
    }

    .static-footer a {
      color: #fff;
      text-decoration: none;
    }

    .static-footer a:hover {
      color: #fdba74;
      text-decoration: underline;
    }

    .static-footer__top {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-bottom: 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }

    .static-footer__brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .static-footer__brand-name {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: #fff;
    }

    .static-footer__brand-tag {
      margin: 4px 0 0;
      font-size: 0.82rem;
      color: #9ca3af;
    }

    .static-footer__text,
    .static-footer__address {
      margin: 0;
      color: #d1d5db;
      font-size: 0.92rem;
    }

    .static-footer__contact {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      font-size: 0.92rem;
    }

    .static-footer__dot {
      color: #6b7280;
    }

    .static-footer__social {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 0.88rem;
    }

    .static-footer__bottom {
      padding-top: 16px;
      font-size: 0.82rem;
      color: #9ca3af;
      text-align: center;
    }

    .static-header__custom,
    .static-footer__custom {
      width: 100%;
      color: inherit;
    }

    .static-header__custom img,
    .static-footer__custom img {
      max-width: 100%;
      height: auto;
    }

    .static-header__custom a,
    .static-footer__custom a {
      color: inherit;
    }

    .static-footer__custom {
      color: var(--footer-text);
    }

    .static-footer__custom a {
      color: #fff;
    }

    @media (max-width: 640px) {
      .static-header__inner,
      .static-main__inner,
      .static-footer__inner {
        width: min(100%, calc(100% - 20px));
      }

      .static-header__badge {
        display: none;
      }

      .static-hero,
      .static-card__body {
        padding: 18px;
      }
    }
  </style>
</head>
<body>
  <div class="static-shell">
    <header class="static-header">
      <div class="static-header__inner">
        ${headerInner}
      </div>
    </header>

    <main class="static-main">
      <div class="static-main__inner">
        <section class="static-hero">
          <span class="static-hero__eyebrow">Static Page</span>
          <h1 class="static-hero__title">${title}</h1>
        </section>

        <article class="static-card">
          <div class="static-card__body">
            <div class="static-page-content">${content}</div>
          </div>
        </article>
      </div>
    </main>

    <footer class="static-footer">
      <div class="static-footer__inner">
        ${footerInner}
      </div>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = {
  STATIC_PAGE_APPS,
  STATIC_PAGE_APP_LABELS,
  normalizeStaticPageApp,
  slugifyStaticPageTitle,
  normalizeStaticPageSlug,
  buildStaticPageApiUrl,
  buildStaticPageViewUrl,
  attachStaticPageUrls,
  toPublicStaticPage,
  renderStaticPageHtml,
  getPublicBaseUrl,
  buildStaticPageAppFilter,
  findActiveStaticPage,
  ensureStaticPagesHaveApp,
  getStaticPageBranding,
};
