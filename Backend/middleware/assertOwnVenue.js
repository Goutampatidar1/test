const Venue = require("../models/other/venue");
const AppError = require("../utils/AppError");
const { asyncHandler } = require("../utils/asyncHandler");
const { assertObjectId } = require("../utils/assertObjectId");

/** Ensures the venue belongs to the logged-in venue vendor. */
const assertOwnVenue = asyncHandler(async (req, res, next) => {
  assertObjectId(req.params.id, "Invalid venue id");
  const venue = await Venue.findById(req.params.id).select("_id addedById role").lean();
  if (!venue) {
    throw new AppError("Venue not found", 404);
  }
  if (venue.role !== "VenueVendor" || String(venue.addedById) !== String(req.auth.sub)) {
    throw new AppError("Forbidden", 403);
  }
  req.venue = venue;
  next();
});

module.exports = { assertOwnVenue };
