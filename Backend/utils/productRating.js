const mongoose = require("mongoose");
const ProductRating = require("../models/other/productRating");
const Product = require("../models/other/product");
const User = require("../models/entity/user");
const AppError = require("./AppError");
const { toAbsoluteUploadUrl } = require("./mediaUrl");

const MAX_REVIEW_LENGTH = 1000;

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function toObjectIdList(values = []) {
  return values.map((value) => toObjectId(value));
}

function activeRateableProductFilter(extra = {}) {
  return {
    status: "active",
    adminApproved: true,
    role: "Vendor",
    ...extra,
  };
}

function formatRatingValue(value, count) {
  const total = Number(count) || 0;
  if (total <= 0) return null;
  const avg = Number(value) || 0;
  return Math.round(avg * 10) / 10;
}

function parseRatingInput(value) {
  const rating = Number(value);
  if (Number.isNaN(rating) || rating < 1 || rating > 5) {
    throw new AppError("Rating must be between 1 and 5", 400);
  }
  return Math.round(rating);
}

function parseReviewInput(value) {
  if (value === undefined || value === null) return "";
  const review = String(value).trim();
  if (review.length > MAX_REVIEW_LENGTH) {
    throw new AppError(`Review cannot exceed ${MAX_REVIEW_LENGTH} characters`, 400);
  }
  return review;
}

async function assertRateableProduct(productId) {
  const product = await Product.findOne(activeRateableProductFilter({ _id: productId }))
    .select("_id name averageRating ratingCount")
    .lean();
  if (!product) {
    throw new AppError("Product not found or unavailable", 404);
  }
  return product;
}

async function syncProductRatingStats(productId) {
  const normalizedProductId = toObjectId(productId);

  const [stats] = await ProductRating.aggregate([
    { $match: { product: normalizedProductId } },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  const averageRating = stats?.averageRating ?? 0;
  const ratingCount = stats?.ratingCount ?? 0;

  await Product.findByIdAndUpdate(normalizedProductId, {
    averageRating: ratingCount > 0 ? Math.round(averageRating * 100) / 100 : 0,
    ratingCount,
  });

  return {
    averageRating: formatRatingValue(averageRating, ratingCount),
    ratingCount,
  };
}

async function getRatingStatsForProducts(productIds = []) {
  if (!productIds.length) return new Map();

  const rows = await ProductRating.aggregate([
    { $match: { product: { $in: toObjectIdList(productIds) } } },
    {
      $group: {
        _id: "$product",
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

function applyRatingStatsToProduct(product, statsMap) {
  if (!product) return product;
  const stats = statsMap.get(String(product._id));
  if (!stats) return product;

  return {
    ...product,
    averageRating: stats.averageRating,
    ratingCount: stats.ratingCount,
  };
}

async function saveProductRatingReview(userId, productId, { rating, review }, { partial = false } = {}) {
  await assertRateableProduct(productId);

  const normalizedUserId = toObjectId(userId);
  const normalizedProductId = toObjectId(productId);

  const existing = await ProductRating.findOne({
    user: normalizedUserId,
    product: normalizedProductId,
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

  const doc = await ProductRating.findOneAndUpdate(
    { user: normalizedUserId, product: normalizedProductId },
    {
      $set: {
        rating: normalizedRating,
        review: normalizedReview,
      },
      $setOnInsert: {
        user: normalizedUserId,
        product: normalizedProductId,
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  const stats = await syncProductRatingStats(productId);
  return {
    rating: doc,
    stats,
    isCreated: !existing,
    isUpdated: Boolean(existing),
  };
}

/** @deprecated use saveProductRatingReview */
async function upsertProductRating(userId, productId, { rating, review }) {
  const result = await saveProductRatingReview(userId, productId, { rating, review });
  return { rating: result.rating, stats: result.stats };
}

async function deleteProductRating(userId, productId) {
  const deleted = await ProductRating.findOneAndDelete({
    user: toObjectId(userId),
    product: toObjectId(productId),
  }).lean();
  if (!deleted) {
    return { deleted: false, stats: null };
  }

  const stats = await syncProductRatingStats(productId);
  return { deleted: true, stats };
}

async function getUserProductRating(userId, productId) {
  if (!userId || !productId) return null;

  return ProductRating.findOne({
    user: toObjectId(userId),
    product: toObjectId(productId),
  }).lean();
}

async function getUserRatingsForProducts(userId, productIds) {
  if (!userId || !productIds?.length) return new Map();

  const rows = await ProductRating.find({
    user: toObjectId(userId),
    product: { $in: toObjectIdList(productIds) },
  })
    .select("product rating review createdAt updatedAt")
    .lean();

  return new Map(rows.map((row) => [String(row.product), row]));
}

async function removeAllRatingsForProduct(productId) {
  await ProductRating.deleteMany({ product: productId });
}

function toUserRatingReviewPayload(productId, saved, stats, { isCreated = false, isUpdated = false } = {}) {
  return {
    _id: saved._id,
    productId,
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

function toPublicProductRatingItem(doc, user, baseUrl) {
  if (!doc) return null;

  return {
    _id: doc._id,
    productId: doc.product,
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

async function listProductReviews(productId, baseUrl, { skip = 0, limit = 20 } = {}) {
  const normalizedProductId = toObjectId(productId);
  const filter = { product: normalizedProductId };
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safeSkip = Math.max(0, Number(skip) || 0);

  const [rows, total] = await Promise.all([
    ProductRating.find(filter).sort({ createdAt: -1 }).skip(safeSkip).limit(safeLimit).lean(),
    ProductRating.countDocuments(filter),
  ]);

  if (!rows.length) {
    return { reviews: [], total };
  }

  const userIds = [...new Set(rows.map((row) => String(row.user)).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } }).select("name profileImage").lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const reviews = rows
    .map((row) => toPublicProductRatingItem(row, userMap.get(String(row.user)), baseUrl))
    .filter(Boolean);

  return { reviews, total };
}

module.exports = {
  formatRatingValue,
  toObjectId,
  toObjectIdList,
  parseRatingInput,
  parseReviewInput,
  saveProductRatingReview,
  upsertProductRating,
  deleteProductRating,
  getUserProductRating,
  getUserRatingsForProducts,
  getRatingStatsForProducts,
  applyRatingStatsToProduct,
  removeAllRatingsForProduct,
  toUserRatingReviewPayload,
  toPublicProductRatingItem,
  listProductReviews,
};
