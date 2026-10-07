const { asyncHandler } = require("../../utils/asyncHandler");
const { loadHotDealCards } = require("../../utils/homeFeed");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");

/** GET /public/hot-deals — "Hot deals of the day" shown between videos and products. */
exports.listHotDeals = asyncHandler(async (req, res) => {
  const settings = await getFeatureSettings();
  if (!settings.hotDealsEnabled) {
    return res.status(200).json({ status: false, message: "Hot deals are off", data: [], enabled: false });
  }

  const cards = await loadHotDealCards(req, { limit: req.query.limit });

  res.status(200).json({
    status: cards.length > 0,
    message: "Hot deals fetched",
    data: cards,
    enabled: true,
  });
});
