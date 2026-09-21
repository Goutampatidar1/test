const { asyncHandler } = require("../../utils/asyncHandler");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  getStaticPageLayout,
  listStaticPageLayouts,
  upsertStaticPageLayout,
} = require("../../utils/staticPageLayout");
const { normalizeStaticPageApp } = require("../../utils/staticPage");

exports.listLayouts = asyncHandler(async (req, res) => {
  const layouts = await listStaticPageLayouts();
  res.json({
    message: "Static page layouts fetched",
    data: layouts,
  });
});

exports.getLayout = asyncHandler(async (req, res) => {
  const app = normalizeStaticPageApp(req.params.app ?? req.query.app);
  if (!app) {
    return res.status(400).json({ message: "Invalid app", data: null });
  }

  const layout = await getStaticPageLayout(app, { includeInactive: true });
  res.json({
    message: "Static page layout fetched",
    data: layout,
  });
});

exports.updateLayout = asyncHandler(async (req, res) => {
  const app = normalizeStaticPageApp(req.params.app ?? req.body.app);
  if (!app) {
    return res.status(400).json({ message: "Invalid app", data: null });
  }

  const layout = await upsertStaticPageLayout(app, req.body);
  const baseUrl = getPublicBaseUrl(req);

  res.json({
    message: "Static page layout updated",
    data: {
      ...layout,
      previewUrl: `${baseUrl}/view/${app}/about-us`,
    },
  });
});
