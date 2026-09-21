const ProductVideoFeed = require("../../models/other/productVideoFeed");
const VenueVideoFeed = require("../../models/other/venueVideoFeed");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { toggleVideoFeedLike } = require("../../utils/productVideoFeedLike");
const { toggleVenueVideoFeedLike } = require("../../utils/venueVideoFeedLike");
const AppError = require("../../utils/AppError");

/** Toggle like on an ecom or venue video feed (reel). */
exports.toggleVideoFeedLike = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId;
  assertObjectId(feedId, "Invalid video feed id");

  const typeHint = String(req.body?.type ?? req.query?.type ?? "").trim().toLowerCase();

  let result;
  if (typeHint === "venue" || typeHint === "venues" || typeHint === "service") {
    result = await toggleVenueVideoFeedLike(req.user._id, feedId);
  } else if (typeHint === "ecom" || typeHint === "product") {
    result = await toggleVideoFeedLike(req.user._id, feedId);
    result = { ...result, type: "ecom" };
  } else {
    const [ecomFeed, venueFeed] = await Promise.all([
      ProductVideoFeed.findOne({ _id: feedId, status: "active" }).select("_id").lean(),
      VenueVideoFeed.findOne({ _id: feedId, status: "active" }).select("_id").lean(),
    ]);
    if (venueFeed && !ecomFeed) {
      result = await toggleVenueVideoFeedLike(req.user._id, feedId);
    } else if (ecomFeed) {
      result = await toggleVideoFeedLike(req.user._id, feedId);
      result = { ...result, type: "ecom" };
    } else {
      throw new AppError("Video not found or unavailable", 404);
    }
  }

  return res.status(200).json({
    status: true,
    message: result.isLiked ? "Video liked" : "Video unliked",
    data: [
      {
        videoFeedId: feedId,
        type: result.type || "ecom",
        isLiked: result.isLiked,
        likeCount: result.likeCount,
      },
    ],
  });
});
