const VenueEnquiry = require("../../models/other/venueEnquiry");
const VenueVendor = require("../../models/entity/venueVendor");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const { queueNotifyAllAdmins } = require("../../utils/adminInbox");
const { queueAppNotification } = require("../../utils/appNotify");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const { resolveVenueVendorContact } = require("../../utils/publicVendorContact");
const {
  OPEN_STATUSES,
  createEnquiry,
  expireStaleEnquiries,
  toEnquiryPayload,
  bookingBodyFromEnquiry,
  loadBookableEnquiry,
} = require("../../utils/venueEnquiry");
const {
  parseBookingRequest,
  calculateVenueBookingPricingWithToken,
  assertVenueAvailableForBooking,
} = require("../../utils/venueBooking");
const { assertNoEnquiryHold } = require("../../utils/venueEnquiry");
const bookingController = require("./venueBookingController");

const VENUE_POPULATE = "name thumbnail city address";

async function vendorContactForEnquiry(enquiry) {
  if (!enquiry.vendor) return null;
  const vendor = await VenueVendor.findById(enquiry.vendor).lean();
  if (!vendor) return null;
  // Phone is only revealed to the user after the venue accepts, and only if plan rules allow it.
  const reveal = ["accepted", "converted"].includes(enquiry.status);
  const contact = await resolveVenueVendorContact(vendor);
  return {
    name: vendor.businessName || vendor.name || "",
    ...contact,
    phone: reveal ? contact.phone : "",
    canCall: reveal && contact.canCall,
  };
}

async function respondWithEnquiry(req, res, message, enquiryDoc, statusCode = 200) {
  const enquiry = await VenueEnquiry.findById(enquiryDoc._id).populate("venue", VENUE_POPULATE).lean();
  const vendorContact = await vendorContactForEnquiry(enquiry);
  return sendSuccess(
    res,
    message,
    toEnquiryPayload(enquiry, { baseUrl: getPublicBaseUrl(req), audience: "user", vendorContact }),
    statusCode
  );
}

async function submitEnquiry(req, res, source) {
  const venue = await bookingController.loadBookableVenue(req.params.venueId);
  const enquiry = await createEnquiry({
    venue,
    user: req.user,
    body: req.body ?? {},
    source,
  });

  if (enquiry.vendor) {
    queueAppNotification({
      recipientType: "venueVendor",
      recipientId: enquiry.vendor,
      type: "enquiry_received",
      title: "New enquiry",
      message: `${enquiry.contact.name} sent an enquiry for ${venue.name}${
        enquiry.bookingDates.length ? ` on ${enquiry.bookingDates[0]}` : ""
      }. Call them and accept to open booking.`,
      metadata: {
        event: "enquiry_received",
        enquiryId: String(enquiry._id),
        venueId: String(venue._id),
        linkPath: `/vendor/enquiries/${enquiry._id}`,
      },
    });
  }
  queueNotifyAllAdmins({
    type: "venue_booking_placed",
    title: "New venue enquiry",
    message: `Enquiry ${enquiry.enquiryNumber} was sent for ${venue.name}.`,
    metadata: {
      event: "enquiry_received",
      enquiryId: String(enquiry._id),
      venueId: String(venue._id),
      linkPath: `/admin/enquiries/${enquiry._id}`,
    },
  });

  return respondWithEnquiry(req, res, "Enquiry sent. The venue will contact you shortly.", enquiry, 201);
}

/** Full enquiry form: dates, guests, event, message. */
exports.createVenueEnquiry = asyncHandler((req, res) => submitEnquiry(req, res, "standard"));

/** Shortcut: one tap, uses profile name/phone, dates optional. */
exports.createQuickEnquiry = asyncHandler((req, res) => submitEnquiry(req, res, "quick"));

exports.listMyEnquiries = asyncHandler(async (req, res) => {
  await expireStaleEnquiries();
  const { page, limit, skip } = getPagination(req.query);
  const status = String(req.query.status || "").trim().toLowerCase();
  const filter = { user: req.user._id };
  if (status === "open") filter.status = { $in: OPEN_STATUSES };
  else if (status && status !== "all") filter.status = status;

  const [rows, total] = await Promise.all([
    VenueEnquiry.find(filter)
      .populate("venue", VENUE_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueEnquiry.countDocuments(filter),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const data = rows.map((row) => toEnquiryPayload(row, { baseUrl, audience: "user" }));
  return res.status(200).json({
    status: data.length > 0,
    message: "Enquiries fetched",
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    filters: { status: status || "all" },
  });
});

async function findOwnEnquiry(req) {
  assertObjectId(req.params.id, "Invalid enquiry id");
  await expireStaleEnquiries();
  const enquiry = await VenueEnquiry.findOne({ _id: req.params.id, user: req.user._id });
  if (!enquiry) throw new AppError("Enquiry not found", 404);
  return enquiry;
}

exports.getMyEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await findOwnEnquiry(req);
  return respondWithEnquiry(req, res, "Enquiry fetched", enquiry);
});

exports.cancelMyEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await findOwnEnquiry(req);
  if (!OPEN_STATUSES.includes(enquiry.status)) {
    throw new AppError(`Enquiry is already ${enquiry.status}`, 409);
  }
  enquiry.status = "cancelled";
  enquiry.cancellationReason = String(req.body?.reason ?? "").trim().slice(0, 500);
  await enquiry.save();

  if (enquiry.vendor) {
    queueAppNotification({
      recipientType: "venueVendor",
      recipientId: enquiry.vendor,
      type: "enquiry_cancelled",
      title: "Enquiry cancelled",
      message: `${enquiry.contact.name} cancelled enquiry ${enquiry.enquiryNumber}.`,
      metadata: { event: "enquiry_cancelled", enquiryId: String(enquiry._id) },
    });
  }
  return respondWithEnquiry(req, res, "Enquiry cancelled", enquiry);
});

/** Pricing + availability for an accepted enquiry — what the "Confirm & pay" screen shows. */
exports.getEnquiryBookingPreview = asyncHandler(async (req, res) => {
  const found = await findOwnEnquiry(req);
  const enquiry = await loadBookableEnquiry(found._id, req.user._id);
  const venue = await bookingController.loadBookableVenue(String(enquiry.venue));
  const body = bookingBodyFromEnquiry(enquiry, { ...(req.query || {}) });
  const bookingRequest = parseBookingRequest(body);

  let available = true;
  let availabilityMessage = "Slot available for booking.";
  try {
    await assertVenueAvailableForBooking(venue._id, bookingRequest);
    await assertNoEnquiryHold(venue._id, bookingRequest, { excludeEnquiryId: enquiry._id });
  } catch (error) {
    if (error?.statusCode === 409) {
      available = false;
      availabilityMessage = error.message;
    } else {
      throw error;
    }
  }

  const pricing = calculateVenueBookingPricingWithToken(venue, bookingRequest);
  const settings = await getFeatureSettings();

  return sendSuccess(res, "Enquiry booking preview", {
    enquiryId: enquiry._id,
    venueId: venue._id,
    bookingType: bookingRequest.bookingType,
    bookingDates: bookingRequest.bookingDates,
    available,
    availabilityMessage,
    holdExpiresAt: enquiry.holdExpiresAt,
    bookingWindowHours: settings.enquiryBookingWindowHours,
    totalAmount: pricing.grandTotal,
    amountDueNow: pricing.amountDueNow,
    pricing: {
      venueFee: pricing.venueFee,
      discountTotal: pricing.discountTotal,
      taxTotal: pricing.taxTotal,
      subTotal: pricing.subTotal,
      grandTotal: pricing.grandTotal,
      tokenAmount: pricing.tokenAmount ?? 0,
      remainingAmount: pricing.remainingAmount ?? 0,
      usesTokenPayment: Boolean(pricing.usesTokenPayment),
      currency: pricing.currency,
      symbol: pricing.symbol,
      rateLabel: pricing.rateLabel,
    },
  });
});

/** Convert an accepted enquiry into a booking (token/full payment follows the normal booking rules). */
exports.bookFromEnquiry = asyncHandler(async (req, res) => {
  const found = await findOwnEnquiry(req);
  const enquiry = await loadBookableEnquiry(found._id, req.user._id);
  const venue = await bookingController.loadBookableVenue(String(enquiry.venue));
  return bookingController.createBookingCore(req, res, {
    venue,
    enquiry,
    body: bookingBodyFromEnquiry(enquiry, req.body ?? {}),
  });
});
