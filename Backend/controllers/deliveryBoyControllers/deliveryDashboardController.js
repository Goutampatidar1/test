const { asyncHandler } = require("../../utils/asyncHandler");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { sendSuccess } = require("../../utils/apiResponse");
const { getDriverHomeDashboard } = require("../../utils/deliveryDriverOrder");

/** GET /api/delivery/home | /api/delivery/dashboard — earnings, stats, new deliveries preview */
exports.getHome = asyncHandler(async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const previewLimit = Math.min(
    20,
    Math.max(
      1,
      parseInt(
        String(req.query.newDeliveriesLimit ?? req.query.limit ?? "5"),
        10
      ) || 5
    )
  );

  const dashboard = await getDriverHomeDashboard(req.user._id, {
    baseUrl,
    newDeliveriesLimit: previewLimit,
  });

  return sendSuccess(res, "Driver dashboard fetched", dashboard);
});
