const DeliveryBoyRating = require("../models/other/deliveryBoyRating");
const Order = require("../models/other/order");
const DeliveryBoy = require("../models/entity/deliveryboy");
const AppError = require("./AppError");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const {
  parseRatingInput,
  parseReviewInput,
  formatRatingValue,
  toObjectId,
  toObjectIdList,
} = require("./productRating");

function resolveOrderDeliveryBoyId(order) {
  if (!order) return null;
  if (order.deliveryBoy) {
    return typeof order.deliveryBoy === "object" ? order.deliveryBoy._id : order.deliveryBoy;
  }
  return null;
}

function isOrderDelivered(order) {
  if (!order) return false;
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  if (orderStatus === "delivered") return true;
  return String(order.driverDelivery?.status || "").toLowerCase() === "delivered";
}

async function assertRateableDeliveryOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId })
    .populate("deliveryBoy", "name profileImage status approvalStatus")
    .lean();

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const orderStatus = String(order.orderStatus || "").toLowerCase();
  if (orderStatus === "cancelled" || orderStatus === "refunded") {
    throw new AppError("Cannot rate driver for a cancelled order", 400);
  }

  if (!isOrderDelivered(order)) {
    throw new AppError("You can rate the driver after the order is delivered", 400);
  }

  const deliveryBoyId = resolveOrderDeliveryBoyId(order);
  if (!deliveryBoyId) {
    throw new AppError("No delivery driver assigned to this order", 400);
  }

  const deliveryBoy =
    typeof order.deliveryBoy === "object" && order.deliveryBoy
      ? order.deliveryBoy
      : await DeliveryBoy.findById(deliveryBoyId)
          .select("name profileImage status approvalStatus averageRating ratingCount")
          .lean();

  if (!deliveryBoy) {
    throw new AppError("Delivery driver not found", 404);
  }

  return { order, deliveryBoy, deliveryBoyId };
}

async function syncDeliveryBoyRatingStats(deliveryBoyId) {
  const normalizedDeliveryBoyId = toObjectId(deliveryBoyId);

  const [stats] = await DeliveryBoyRating.aggregate([
    { $match: { deliveryBoy: normalizedDeliveryBoyId } },
    {
      $group: {
        _id: "$deliveryBoy",
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  const averageRating = stats?.averageRating ?? 0;
  const ratingCount = stats?.ratingCount ?? 0;

  await DeliveryBoy.findByIdAndUpdate(normalizedDeliveryBoyId, {
    averageRating: ratingCount > 0 ? Math.round(averageRating * 100) / 100 : 0,
    ratingCount,
  });

  return {
    averageRating: formatRatingValue(averageRating, ratingCount),
    ratingCount,
  };
}

async function getRatingStatsForDeliveryBoys(deliveryBoyIds = []) {
  if (!deliveryBoyIds.length) return new Map();

  const rows = await DeliveryBoyRating.aggregate([
    { $match: { deliveryBoy: { $in: toObjectIdList(deliveryBoyIds) } } },
    {
      $group: {
        _id: "$deliveryBoy",
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        averageRating: row.averageRating,
        ratingCount: row.ratingCount,
        rating: formatRatingValue(row.averageRating, row.ratingCount),
      },
    ])
  );
}

async function saveDeliveryBoyRatingReview(
  userId,
  orderId,
  { rating, review },
  { partial = false } = {}
) {
  const { order, deliveryBoy, deliveryBoyId } = await assertRateableDeliveryOrder(userId, orderId);

  const normalizedUserId = toObjectId(userId);
  const normalizedOrderId = toObjectId(orderId);
  const normalizedDeliveryBoyId = toObjectId(deliveryBoyId);

  const existing = await DeliveryBoyRating.findOne({
    user: normalizedUserId,
    order: normalizedOrderId,
  }).lean();

  const hasRating = rating !== undefined && rating !== null && rating !== "";
  const hasReview = review !== undefined && review !== null;

  if (!existing && !hasRating) {
    throw new AppError("Rating is required to submit a review", 400);
  }

  if (partial && !existing) {
    throw new AppError("Review not found. Submit rating first", 404);
  }

  if (partial && !hasRating && !hasReview) {
    throw new AppError("Provide rating or review to update", 400);
  }

  const normalizedRating = hasRating ? parseRatingInput(rating) : existing.rating;
  const normalizedReview = hasReview ? parseReviewInput(review) : (existing?.review ?? "");

  const doc = await DeliveryBoyRating.findOneAndUpdate(
    { user: normalizedUserId, order: normalizedOrderId },
    {
      $set: {
        deliveryBoy: normalizedDeliveryBoyId,
        rating: normalizedRating,
        review: normalizedReview,
      },
      $setOnInsert: {
        user: normalizedUserId,
        order: normalizedOrderId,
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  const stats = await syncDeliveryBoyRatingStats(deliveryBoyId);

  return {
    rating: doc,
    deliveryBoy,
    order,
    stats,
    isCreated: !existing,
    isUpdated: Boolean(existing),
  };
}

async function deleteDeliveryBoyRating(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const deliveryBoyId = resolveOrderDeliveryBoyId(order);
  const deleted = await DeliveryBoyRating.findOneAndDelete({
    user: toObjectId(userId),
    order: toObjectId(orderId),
  }).lean();

  if (!deleted) {
    return { deleted: false, stats: null, deliveryBoyId };
  }

  const stats = deliveryBoyId ? await syncDeliveryBoyRatingStats(deliveryBoyId) : null;
  return { deleted: true, stats, deliveryBoyId };
}

async function getUserDeliveryBoyRatingForOrder(userId, orderId) {
  if (!userId || !orderId) return null;

  return DeliveryBoyRating.findOne({
    user: toObjectId(userId),
    order: toObjectId(orderId),
  }).lean();
}

function canRateDeliveryOrder(order) {
  if (!order) return false;
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  if (orderStatus === "cancelled" || orderStatus === "refunded") return false;
  return isOrderDelivered(order) && Boolean(resolveOrderDeliveryBoyId(order));
}

function toUserDeliveryBoyRatingPayload(
  orderId,
  deliveryBoyId,
  saved,
  stats,
  { isCreated = false, isUpdated = false } = {}
) {
  return {
    _id: saved._id,
    orderId,
    deliveryBoyId,
    driverId: deliveryBoyId,
    rating: saved.rating,
    review: saved.review ?? "",
    averageRating: stats?.averageRating ?? null,
    ratingCount: stats?.ratingCount ?? 0,
    isCreated,
    isUpdated,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

function toPublicDeliveryBoyRatingItem(doc, user, baseUrl) {
  if (!doc) return null;

  return {
    _id: doc._id,
    deliveryBoyId: doc.deliveryBoy,
    driverId: doc.deliveryBoy,
    orderId: doc.order,
    rating: doc.rating,
    review: doc.review ?? "",
    user: user
      ? {
          _id: user._id,
          name: user.name,
          profileImage: user.profileImage ? toAbsoluteUploadUrl(user.profileImage, baseUrl) : null,
        }
      : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = {
  assertRateableDeliveryOrder,
  saveDeliveryBoyRatingReview,
  deleteDeliveryBoyRating,
  getUserDeliveryBoyRatingForOrder,
  getRatingStatsForDeliveryBoys,
  syncDeliveryBoyRatingStats,
  canRateDeliveryOrder,
  resolveOrderDeliveryBoyId,
  toUserDeliveryBoyRatingPayload,
  toPublicDeliveryBoyRatingItem,
};
