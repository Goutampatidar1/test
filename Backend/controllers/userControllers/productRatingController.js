const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const {
  saveProductRatingReview,
  deleteProductRating,
  getUserProductRating,
  getRatingStatsForProducts,
  toUserRatingReviewPayload,
  formatRatingValue,
} = require("../../utils/productRating");

function buildRatingReviewPayload(productId, saved, stats, meta = {}) {
  return {
    status: true,
    message: meta.message || "Product review saved",
    data: [toUserRatingReviewPayload(productId, saved, stats, meta)],
  };
}

/** Create rating + review (first time) or full replace if already exists */
exports.createProductReview = asyncHandler(async (req, res) => {
  assertObjectId(req.params.productId, "Invalid product id");

  const { rating, review } = req.body ?? {};
  const result = await saveProductRatingReview(req.user._id, req.params.productId, {
    rating,
    review,
  });

  return res.status(200).json(
    buildRatingReviewPayload(req.params.productId, result.rating, result.stats, {
      isCreated: result.isCreated,
      isUpdated: result.isUpdated,
      message: result.isCreated ? "Rating and review submitted" : "Rating and review updated",
    })
  );
});

/** Update rating and/or review — send only fields you want to change */
exports.updateProductReview = asyncHandler(async (req, res) => {
  assertObjectId(req.params.productId, "Invalid product id");

  const { rating, review } = req.body ?? {};
  const result = await saveProductRatingReview(
    req.user._id,
    req.params.productId,
    { rating, review },
    { partial: true }
  );

  return res.status(200).json(
    buildRatingReviewPayload(req.params.productId, result.rating, result.stats, {
      isCreated: false,
      isUpdated: true,
      message: "Rating and review updated",
    })
  );
});

exports.getMyProductReview = asyncHandler(async (req, res) => {
  assertObjectId(req.params.productId, "Invalid product id");

  const [saved, statsMap] = await Promise.all([
    getUserProductRating(req.user._id, req.params.productId),
    getRatingStatsForProducts([req.params.productId]),
  ]);

  const stats = statsMap.get(String(req.params.productId)) ?? {
    averageRating: null,
    ratingCount: 0,
  };

  return res.status(200).json({
    status: Boolean(saved),
    message: saved ? "Product review fetched" : "No review found for this product",
    data: saved
      ? [
          toUserRatingReviewPayload(req.params.productId, saved, {
            averageRating: stats.rating ?? formatRatingValue(stats.averageRating, stats.ratingCount),
            ratingCount: stats.ratingCount ?? 0,
          }),
        ]
      : [],
  });
});

exports.deleteMyProductReview = asyncHandler(async (req, res) => {
  assertObjectId(req.params.productId, "Invalid product id");

  const { deleted, stats } = await deleteProductRating(req.user._id, req.params.productId);

  return res.status(200).json({
    status: true,
    message: deleted ? "Rating and review removed" : "No review found for this product",
    data: [
      {
        productId: req.params.productId,
        rating: null,
        review: "",
        averageRating: stats?.averageRating ?? null,
        ratingCount: stats?.ratingCount ?? 0,
        isCreated: false,
        isUpdated: false,
      },
    ],
  });
});

// Legacy handlers — same as product-review
exports.submitProductRating = exports.createProductReview;
exports.getMyProductRating = exports.getMyProductReview;
exports.deleteMyProductRating = exports.deleteMyProductReview;
