const { Page } = require("../../models");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  normalizeStaticPageApp,
  normalizeStaticPageSlug,
  toPublicStaticPage,
  renderStaticPageHtml,
  STATIC_PAGE_APP_LABELS,
  buildStaticPageAppFilter,
  findActiveStaticPage,
  getStaticPageBranding,
} = require("../../utils/staticPage");
const { getStaticPageLayout } = require("../../utils/staticPageLayout");

exports.listPages = asyncHandler(async (req, res) => {
  const app = normalizeStaticPageApp(req.query.app);
  if (!app) {
    throw new AppError("app query param is required (user, vendor, venue_vendor, delivery)", 400);
  }

  const appFilter = buildStaticPageAppFilter(app);
  const pages = await Page.find({ status: "active", ...appFilter })
    .sort({ title: 1 })
    .select("title slug app updatedAt")
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items = pages.map((page) => ({
    ...toPublicStaticPage(page),
    appLabel: STATIC_PAGE_APP_LABELS[app],
    viewUrl: `${baseUrl}/view/${app}/${encodeURIComponent(page.slug)}`,
  }));

  return sendSuccess(res, "Static pages fetched", items);
});

exports.getPageBySlug = asyncHandler(async (req, res) => {
  const slug = normalizeStaticPageSlug(req.params.slug);
  if (!slug) {
    throw new AppError("Slug is required", 400);
  }

  const app = normalizeStaticPageApp(req.query.app);
  if (!app) {
    throw new AppError("app query param is required (user, vendor, venue_vendor, delivery)", 400);
  }

  const page = await findActiveStaticPage(Page, app, slug);
  if (!page) {
    throw new AppError("Page not found", 404);
  }

  const baseUrl = getPublicBaseUrl(req);
  const resolvedApp = normalizeStaticPageApp(page.app) || app;
  const payload = {
    ...toPublicStaticPage(page),
    appLabel: STATIC_PAGE_APP_LABELS[resolvedApp],
    viewUrl: `${baseUrl}/view/${resolvedApp}/${encodeURIComponent(slug)}`,
  };

  return sendSuccess(res, "Static page fetched", payload);
});

exports.renderPageView = asyncHandler(async (req, res) => {
  const slug = normalizeStaticPageSlug(req.params.slug);
  const app = normalizeStaticPageApp(req.params.app);

  if (!slug || !app) {
    throw new AppError("Invalid page URL", 404);
  }

  const page = await findActiveStaticPage(Page, app, slug);
  if (!page) {
    throw new AppError("Page not found", 404);
  }

  const baseUrl = getPublicBaseUrl(req);
  const [branding, layout] = await Promise.all([
    getStaticPageBranding(app, baseUrl),
    getStaticPageLayout(app),
  ]);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderStaticPageHtml(page, baseUrl, { branding, layout }));
});
