const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const {
  saveDeliveryBoyRatingReview,
  deleteDeliveryBoyRating,
  getUserDeliveryBoyRatingForOrder,
  getRatingStatsForDeliveryBoys,
  toUserDeliveryBoyRatingPayload,
} = require("../../utils/deliveryBoyRating");
const { formatRatingValue } = require("../../utils/productRating");

function resolveOrderIdParam(req) {
  return req.params.orderId ?? req.params.id;
}

function buildDriverRatingPayload(orderId, deliveryBoyId, saved, stats, meta = {}) {
  return {
    status: true,
    message: meta.message || "Driver review saved",
    data: [toUserDeliveryBoyRatingPayload(orderId, deliveryBoyId, saved, stats, meta)],
  };
}

/** Submit or replace driver rating + review for a delivered order */
exports.createDriverReview = asyncHandler(async (req, res) => {
  const orderId = resolveOrderIdParam(req);
  assertObjectId(orderId, "Invalid order id");

  const { rating, review } = req.body ?? {};
  const result = await saveDeliveryBoyRatingReview(req.user._id, orderId, { rating, review });

  return res.status(200).json(
    buildDriverRatingPayload(orderId, result.deliveryBoy._id, result.rating, result.stats, {
      isCreated: result.isCreated,
      isUpdated: result.isUpdated,
      message: result.isCreated ? "Driver rating submitted" : "Driver rating updated",
    })
  );
});

/** Update rating and/or review */
exports.updateDriverReview = asyncHandler(async (req, res) => {
  const orderId = resolveOrderIdParam(req);
  assertObjectId(orderId, "Invalid order id");

  const { rating, review } = req.body ?? {};
  const result = await saveDeliveryBoyRatingReview(
    req.user._id,
    orderId,
    { rating, review },
    { partial: true }
  );

  return res.status(200).json(
    buildDriverRatingPayload(orderId, result.deliveryBoy._id, result.rating, result.stats, {
      isCreated: false,
      isUpdated: true,
      message: "Driver rating updated",
    })
  );
});

exports.getMyDriverReview = asyncHandler(async (req, res) => {
  const orderId = resolveOrderIdParam(req);
  assertObjectId(orderId, "Invalid order id");

  const saved = await getUserDeliveryBoyRatingForOrder(req.user._id, orderId);
  if (!saved) {
    return res.status(200).json({
      status: false,
      message: "No review found for this order",
      data: [],
    });
  }

  const statsMap = await getRatingStatsForDeliveryBoys([saved.deliveryBoy]);
  const stats = statsMap.get(String(saved.deliveryBoy)) ?? {
    averageRating: null,
    ratingCount: 0,
  };

  return res.status(200).json({
    status: true,
    message: "Driver review fetched",
    data: [
      toUserDeliveryBoyRatingPayload(orderId, saved.deliveryBoy, saved, {
        averageRating: stats.rating ?? formatRatingValue(stats.averageRating, stats.ratingCount),
        ratingCount: stats.ratingCount ?? 0,
      }),
    ],
  });
});

exports.deleteMyDriverReview = asyncHandler(async (req, res) => {
  const orderId = resolveOrderIdParam(req);
  assertObjectId(orderId, "Invalid order id");

  const { deleted, stats } = await deleteDeliveryBoyRating(req.user._id, orderId);

  return res.status(200).json({
    status: true,
    message: deleted ? "Driver rating removed" : "No review found for this order",
    data: [
      {
        orderId,
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

exports.submitDriverRating = exports.createDriverReview;
exports.getMyDriverRating = exports.getMyDriverReview;
exports.deleteMyDriverRating = exports.deleteMyDriverReview;
