const { asyncHandler } = require("../../utils/asyncHandler");
const { loadHotDealCards } = require("../../utils/homeFeed");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const { getHotDealsTimer } = require("../../utils/hotDeals");

/** GET /public/hot-deals — "Hot deals of the day" shown between videos and products. */
exports.listHotDeals = asyncHandler(async (req, res) => {
  const settings = await getFeatureSettings();
  if (!settings.hotDealsEnabled) {
    return res.status(200).json({
      status: false,
      message: "Hot deals are off",
      data: [],
      enabled: false,
      timer: { startTime: "00:00", endTime: "23:59", percentOff: 50 },
    });
  }

  const [cards, timer] = await Promise.all([
    loadHotDealCards(req, { limit: req.query.limit }),
    getHotDealsTimer(),
  ]);

  res.status(200).json({
    status: true,
    message: cards.length > 0 ? "Hot deals fetched" : "No hot deals right now",
    data: cards,
    enabled: true,
    timer,
  });
});
