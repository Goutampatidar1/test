const Venue = require("../../models/other/venue");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getVenueDisplayPrice } = require("../../utils/venuePricing");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const {
  getActiveVenueDiscount,
  parseDiscountInput,
} = require("../../utils/venueDiscount");
const { alertVenueDiscount, queueDiscountAlert } = require("../../utils/discountAlerts");

const SUGGESTED_PERCENTS = [5, 10, 15, 20, 25];

async function loadOwnVenue(req) {
  assertObjectId(req.params.id, "Invalid venue id");
  const venue = await Venue.findOne({
    _id: req.params.id,
    role: "VenueVendor",
    addedById: req.auth.sub,
  });
  if (!venue) throw new AppError("Service not found", 404);
  return venue;
}

async function toDiscountState(venue) {
  const settings = await getFeatureSettings();
  const base = getVenueDisplayPrice(venue).amount;
  const active = getActiveVenueDiscount(venue);
  return {
    venueId: venue._id,
    name: venue.name,
    price: base,
    hasDiscount: Boolean(active),
    current: active,
    configured: Number(venue.discountValue) > 0
      ? {
          discountType: venue.discountType,
          discountValue: venue.discountValue,
          label: venue.discountLabel || "",
          startsAt: venue.discountStartsAt,
          endsAt: venue.discountEndsAt,
        }
      : null,
    /** "Want to offer a discount?" prompt data for the vendor app. */
    suggestions: SUGGESTED_PERCENTS.map((percent) => ({
      percent,
      discountedPrice: Math.max(0, base - Math.round((base * percent) / 100)),
    })),
    customersNotified: Boolean(venue.lastDiscountNotifiedAt),
    alertMinPercent: settings.discountAlertMinPercent,
  };
}

/** GET /venue-vendor/venues/:id/discount — current discount + suggestions (the "ask" step). */
exports.getDiscount = asyncHandler(async (req, res) => {
  const venue = await loadOwnVenue(req);
  return sendSuccess(res, "Discount details fetched", await toDiscountState(venue));
});

/** PUT /venue-vendor/venues/:id/discount — set a discount; users who saved the service are notified. */
exports.setDiscount = asyncHandler(async (req, res) => {
  const venue = await loadOwnVenue(req);
  Object.assign(venue, parseDiscountInput(req.body ?? {}, venue));
  await venue.save();

  const notify = req.body?.notifyUsers !== false && req.body?.notifyUsers !== "false";
  if (notify) {
    queueDiscountAlert(() => alertVenueDiscount(venue._id));
  }
  return sendSuccess(res, "Discount saved", await toDiscountState(venue));
});

/** DELETE /venue-vendor/venues/:id/discount */
exports.clearDiscount = asyncHandler(async (req, res) => {
  const venue = await loadOwnVenue(req);
  venue.discountValue = 0;
  venue.discountLabel = "";
  venue.discountStartsAt = null;
  venue.discountEndsAt = null;
  await venue.save();
  return sendSuccess(res, "Discount removed", await toDiscountState(venue));
});
