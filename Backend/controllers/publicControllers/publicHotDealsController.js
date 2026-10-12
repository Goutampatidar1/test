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
    status: true,
    message: cards.length > 0 ? "Hot deals fetched" : "No hot deals right now",
    data: cards,
    enabled: true,
  });
});
