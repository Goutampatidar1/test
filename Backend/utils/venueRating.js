const mongoose = require("mongoose");
const VenueRating = require("../models/other/venueRating");
const VenueOrder = require("../models/other/venueOrder");
const Venue = require("../models/other/venue");
const AppError = require("./AppError");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const {
  parseRatingInput,
  parseReviewInput,
  formatRatingValue,
  toObjectId,
  toObjectIdList,
} = require("./productRating");
const {
  extractBookingDatesFromOrder,
  resolveBookingStatus,
} = require("./venueBookingHistory");

function getPrimaryVenueFromOrder(order) {
  const item = (order.items ?? []).find((row) => row.venue && typeof row.venue === "object");
  return item?.venue ?? null;
}

function getPrimaryVenueIdFromOrder(order) {
  const item = (order.items ?? []).find((row) => row.venue);
  if (!item?.venue) return null;
  return typeof item.venue === "object" ? item.venue._id : item.venue;
}

async function assertRateableBooking(userId, bookingId) {
  const order = await VenueOrder.findOne({ _id: bookingId, user: userId })
    .populate("items.venue", "name status adminApproved thumbnail city state address")
    .lean();

  if (!order) {
    throw new AppError("Booking not found", 404);
  }

  const bookingDates = extractBookingDatesFromOrder(order);
  const bookingStatus = resolveBookingStatus(order, bookingDates);

  if (bookingStatus === "canceled") {
    throw new AppError("Cannot rate a cancelled booking", 400);
  }

  if (bookingStatus === "upcoming") {
    throw new AppError("You can rate the venue after the booking is completed", 400);
  }

  const venueId = getPrimaryVenueIdFromOrder(order);
  if (!venueId) {
    throw new AppError("Venue not found for this booking", 404);
  }

  const venue =
    getPrimaryVenueFromOrder(order) ||
    (await Venue.findOne({ _id: venueId, status: "active", adminApproved: true })
      .select("name status adminApproved thumbnail city state address")
      .lean());

  if (!venue) {
    throw new AppError("Venue not found or unavailable", 404);
  }

  return { order, venue, venueId };
}

async function syncVenueRatingStats(venueId) {
  const normalizedVenueId = toObjectId(venueId);

  const [stats] = await VenueRating.aggregate([
    { $match: { venue: normalizedVenueId } },
    {
      $group: {
        _id: "$venue",
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  const averageRating = stats?.averageRating ?? 0;
  const ratingCount = stats?.ratingCount ?? 0;

  await Venue.findByIdAndUpdate(normalizedVenueId, {
    averageRating: ratingCount > 0 ? Math.round(averageRating * 100) / 100 : 0,
    ratingCount,
  });

  return {
    averageRating: formatRatingValue(averageRating, ratingCount),
    ratingCount,
  };
}

async function getRatingStatsForVenues(venueIds = []) {
  if (!venueIds.length) return new Map();

  const rows = await VenueRating.aggregate([
    { $match: { venue: { $in: toObjectIdList(venueIds) } } },
    {
      $group: {
        _id: "$venue",
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

async function saveVenueRatingReview(userId, bookingId, { rating, review }, { partial = false } = {}) {
  const { order, venue, venueId } = await assertRateableBooking(userId, bookingId);

  const normalizedUserId = toObjectId(userId);
  const normalizedBookingId = toObjectId(bookingId);
  const normalizedVenueId = toObjectId(venueId);

  const existing = await VenueRating.findOne({
    user: normalizedUserId,
    booking: normalizedBookingId,
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

  const doc = await VenueRating.findOneAndUpdate(
    { user: normalizedUserId, booking: normalizedBookingId },
    {
      $set: {
        venue: normalizedVenueId,
        rating: normalizedRating,
        review: normalizedReview,
      },
      $setOnInsert: {
        user: normalizedUserId,
        booking: normalizedBookingId,
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  const stats = await syncVenueRatingStats(venueId);

  return {
    rating: doc,
    venue,
    order,
    stats,
    isCreated: !existing,
    isUpdated: Boolean(existing),
  };
}

async function deleteVenueRating(userId, bookingId) {
  const order = await VenueOrder.findOne({ _id: bookingId, user: userId }).lean();
  if (!order) {
    throw new AppError("Booking not found", 404);
  }

  const venueId = getPrimaryVenueIdFromOrder(order);
  const deleted = await VenueRating.findOneAndDelete({
    user: toObjectId(userId),
    booking: toObjectId(bookingId),
  }).lean();

  if (!deleted) {
    return { deleted: false, stats: null, venueId };
  }

  const stats = venueId ? await syncVenueRatingStats(venueId) : null;
  return { deleted: true, stats, venueId };
}

async function getUserVenueRatingForBooking(userId, bookingId) {
  if (!userId || !bookingId) return null;

  return VenueRating.findOne({
    user: toObjectId(userId),
    booking: toObjectId(bookingId),
  }).lean();
}

function canRateBooking(order) {
  if (!order) return false;
  const bookingDates = extractBookingDatesFromOrder(order);
  const status = resolveBookingStatus(order, bookingDates);
  return status === "completed";
}

function toUserVenueRatingPayload(bookingId, venueId, saved, stats, { isCreated = false, isUpdated = false } = {}) {
  return {
    _id: saved._id,
    bookingId,
    venueId,
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

function toPublicVenueRatingItem(doc, user, baseUrl) {
  if (!doc) return null;

  return {
    _id: doc._id,
    venueId: doc.venue,
    bookingId: doc.booking,
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
  assertRateableBooking,
  saveVenueRatingReview,
  deleteVenueRating,
  getUserVenueRatingForBooking,
  getRatingStatsForVenues,
  syncVenueRatingStats,
  canRateBooking,
  getPrimaryVenueIdFromOrder,
  toUserVenueRatingPayload,
  toPublicVenueRatingItem,
};
