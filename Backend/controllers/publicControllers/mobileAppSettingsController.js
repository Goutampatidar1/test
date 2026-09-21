const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  buildMobileAppSettings,
  resolveAppFromRequest,
} = require("../../utils/mobileAppSettings");

/**
 * Mobile app settings — branding, contact, payments, static pages (no auth).
 * App is inferred from mount path (/user, /vendor, …) or ?app= query on /public.
 */
exports.getAppSettings = asyncHandler(async (req, res) => {
  const app = resolveAppFromRequest(req);
  const baseUrl = getPublicBaseUrl(req);
  const settings = await buildMobileAppSettings(app, baseUrl);

  sendSuccess(res, "App settings fetched", settings || {});
});
