const StaticPageLayout = require("../models/bussiness/staticPageLayout");
const AppError = require("./AppError");
const { normalizeStaticPageApp, STATIC_PAGE_APPS, STATIC_PAGE_APP_LABELS } = require("./staticPage");

function emptyLayout(app) {
  const normalizedApp = normalizeStaticPageApp(app) || "user";
  return {
    app: normalizedApp,
    appLabel: STATIC_PAGE_APP_LABELS[normalizedApp] || normalizedApp,
    headerContent: "",
    footerContent: "",
    status: "active",
  };
}

async function getStaticPageLayout(app, { includeInactive = false } = {}) {
  const normalizedApp = normalizeStaticPageApp(app);
  if (!normalizedApp) return emptyLayout("user");

  const filter = { app: normalizedApp };
  if (!includeInactive) filter.status = "active";

  const layout = await StaticPageLayout.findOne(filter).lean();
  if (!layout) return emptyLayout(normalizedApp);

  return {
    app: normalizedApp,
    appLabel: STATIC_PAGE_APP_LABELS[normalizedApp] || normalizedApp,
    headerContent: String(layout.headerContent || ""),
    footerContent: String(layout.footerContent || ""),
    status: layout.status || "active",
    updatedAt: layout.updatedAt,
  };
}

async function listStaticPageLayouts() {
  const rows = await StaticPageLayout.find({}).sort({ app: 1 }).lean();
  const map = new Map(rows.map((row) => [row.app, row]));

  return STATIC_PAGE_APPS.map((app) => {
    const row = map.get(app);
    if (!row) return emptyLayout(app);
    return {
      app,
      appLabel: STATIC_PAGE_APP_LABELS[app] || app,
      headerContent: String(row.headerContent || ""),
      footerContent: String(row.footerContent || ""),
      status: row.status || "active",
      updatedAt: row.updatedAt,
    };
  });
}

async function upsertStaticPageLayout(app, payload = {}) {
  const normalizedApp = normalizeStaticPageApp(app);
  if (!normalizedApp) {
    throw new AppError(`Invalid app. Use one of: ${STATIC_PAGE_APPS.join(", ")}`, 400);
  }

  const update = {
    headerContent: String(payload.headerContent ?? "").trim(),
    footerContent: String(payload.footerContent ?? "").trim(),
    status: payload.status === "inactive" ? "inactive" : "active",
  };

  const layout = await StaticPageLayout.findOneAndUpdate(
    { app: normalizedApp },
    { $set: { app: normalizedApp, ...update } },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  return {
    app: normalizedApp,
    appLabel: STATIC_PAGE_APP_LABELS[normalizedApp] || normalizedApp,
    headerContent: layout.headerContent || "",
    footerContent: layout.footerContent || "",
    status: layout.status || "active",
    updatedAt: layout.updatedAt,
  };
}

module.exports = {
  getStaticPageLayout,
  listStaticPageLayouts,
  upsertStaticPageLayout,
  emptyLayout,
};
