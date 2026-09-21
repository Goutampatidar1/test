const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const {
  saveVenueRatingReview,
  deleteVenueRating,
  getUserVenueRatingForBooking,
  getRatingStatsForVenues,
  toUserVenueRatingPayload,
} = require("../../utils/venueRating");
const { formatRatingValue } = require("../../utils/productRating");

function resolveBookingIdParam(req) {
  return req.params.bookingId ?? req.params.id;
}

function buildVenueRatingPayload(bookingId, venueId, saved, stats, meta = {}) {
  return {
    status: true,
    message: meta.message || "Venue review saved",
    data: [toUserVenueRatingPayload(bookingId, venueId, saved, stats, meta)],
  };
}

/** Submit or replace venue rating + review for a completed booking */
exports.createVenueReview = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");

  const { rating, review } = req.body ?? {};
  const result = await saveVenueRatingReview(req.user._id, bookingId, { rating, review });

  return res.status(200).json(
    buildVenueRatingPayload(bookingId, result.venue._id, result.rating, result.stats, {
      isCreated: result.isCreated,
      isUpdated: result.isUpdated,
      message: result.isCreated ? "Venue rating submitted" : "Venue rating updated",
    })
  );
});

/** Update rating and/or review */
exports.updateVenueReview = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");

  const { rating, review } = req.body ?? {};
  const result = await saveVenueRatingReview(
    req.user._id,
    bookingId,
    { rating, review },
    { partial: true }
  );

  return res.status(200).json(
    buildVenueRatingPayload(bookingId, result.venue._id, result.rating, result.stats, {
      isCreated: false,
      isUpdated: true,
      message: "Venue rating updated",
    })
  );
});

exports.getMyVenueReview = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");

  const saved = await getUserVenueRatingForBooking(req.user._id, bookingId);
  if (!saved) {
    return res.status(200).json({
      status: false,
      message: "No review found for this booking",
      data: [],
    });
  }

  const statsMap = await getRatingStatsForVenues([saved.venue]);
  const stats = statsMap.get(String(saved.venue)) ?? {
    averageRating: null,
    ratingCount: 0,
  };

  return res.status(200).json({
    status: true,
    message: "Venue review fetched",
    data: [
      toUserVenueRatingPayload(bookingId, saved.venue, saved, {
        averageRating: stats.rating ?? formatRatingValue(stats.averageRating, stats.ratingCount),
        ratingCount: stats.ratingCount ?? 0,
      }),
    ],
  });
});

exports.deleteMyVenueReview = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");

  const { deleted, stats } = await deleteVenueRating(req.user._id, bookingId);

  return res.status(200).json({
    status: true,
    message: deleted ? "Venue rating removed" : "No review found for this booking",
    data: [
      {
        bookingId,
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

exports.submitVenueRating = exports.createVenueReview;
exports.getMyVenueRating = exports.getMyVenueReview;
exports.deleteMyVenueRating = exports.deleteMyVenueReview;
