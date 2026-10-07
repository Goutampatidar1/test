const mongoose = require("mongoose");
const VenueEnquiry = require("../../models/other/venueEnquiry");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination, escapeRegex } = require("../../utils/listQuery");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const { queueAppNotification } = require("../../utils/appNotify");
const {
  HOUR_MS,
  expireStaleEnquiries,
  toEnquiryPayload,
} = require("../../utils/venueEnquiry");

const VENUE_POPULATE = "name thumbnail city address";
const USER_POPULATE = "name phone email";

async function findVendorEnquiry(req) {
  assertObjectId(req.params.id, "Invalid enquiry id");
  await expireStaleEnquiries();
  const enquiry = await VenueEnquiry.findOne({ _id: req.params.id, vendor: req.auth.sub });
  if (!enquiry) throw new AppError("Enquiry not found", 404);
  return enquiry;
}

async function respond(req, res, message, enquiry) {
  const row = await VenueEnquiry.findById(enquiry._id)
    .populate("venue", VENUE_POPULATE)
    .populate("user", USER_POPULATE)
    .lean();
  return sendSuccess(
    res,
    message,
    toEnquiryPayload(row, { baseUrl: getPublicBaseUrl(req), audience: "vendor" })
  );
}

exports.listEnquiries = asyncHandler(async (req, res) => {
  await expireStaleEnquiries();
  const { page, limit, skip } = getPagination(req.query);
  const status = String(req.query.status || "").trim().toLowerCase();
  const search = String(req.query.search ?? req.query.q ?? "").trim();

  const filter = { vendor: req.auth.sub };
  if (status && status !== "all") filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ enquiryNumber: rx }, { "contact.name": rx }, { "contact.phone": rx }];
  }

  const [rows, total, counts] = await Promise.all([
    VenueEnquiry.find(filter)
      .populate("venue", VENUE_POPULATE)
      .populate("user", USER_POPULATE)
      .sort({ status: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueEnquiry.countDocuments(filter),
    VenueEnquiry.aggregate([
      { $match: { vendor: new mongoose.Types.ObjectId(String(req.auth.sub)) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const data = rows.map((row) => toEnquiryPayload(row, { baseUrl, audience: "vendor" }));
  const summary = Object.fromEntries(counts.map((row) => [row._id, row.count]));

  return res.status(200).json({
    status: data.length > 0,
    message: "Enquiries fetched",
    data,
    summary: {
      pending: summary.pending || 0,
      accepted: summary.accepted || 0,
      rejected: summary.rejected || 0,
      converted: summary.converted || 0,
      expired: summary.expired || 0,
      cancelled: summary.cancelled || 0,
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    filters: { status: status || "all", search: search || null },
  });
});

exports.getEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await findVendorEnquiry(req);
  return respond(req, res, "Enquiry fetched", enquiry);
});

/** Vendor accepts after talking to the customer: opens the booking window. */
exports.acceptEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await findVendorEnquiry(req);
  if (enquiry.status !== "pending") {
    throw new AppError(`Enquiry is already ${enquiry.status}`, 409);
  }

  const settings = await getFeatureSettings();
  const windowHours = Math.min(
    settings.enquiryBookingWindowHours,
    Math.max(1, Number(req.body?.bookingWindowHours) || settings.enquiryBookingWindowHours)
  );

  enquiry.status = "accepted";
  enquiry.acceptedAt = new Date();
  enquiry.respondedAt = enquiry.acceptedAt;
  enquiry.holdExpiresAt = new Date(enquiry.acceptedAt.getTime() + windowHours * HOUR_MS);
  if (req.body?.note !== undefined) {
    enquiry.vendorNote = String(req.body.note).trim().slice(0, 1000);
  }
  await enquiry.save();

  queueAppNotification({
    recipientType: "user",
    recipientId: enquiry.user,
    type: "enquiry_accepted",
    title: "Enquiry accepted",
    message: `Your enquiry ${enquiry.enquiryNumber} was accepted. Confirm and pay the token within ${windowHours} hours to lock your booking.`,
    metadata: {
      event: "enquiry_accepted",
      enquiryId: String(enquiry._id),
      venueId: String(enquiry.venue),
      linkPath: `/enquiries/${enquiry._id}`,
    },
  });

  return respond(req, res, "Enquiry accepted. The customer can now confirm the booking.", enquiry);
});

exports.rejectEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await findVendorEnquiry(req);
  if (enquiry.status !== "pending") {
    throw new AppError(`Enquiry is already ${enquiry.status}`, 409);
  }
  const reason = String(req.body?.reason ?? req.body?.rejectionReason ?? "").trim();
  if (reason.length < 3) {
    throw new AppError("Please give a short reason (at least 3 characters)", 400);
  }

  enquiry.status = "rejected";
  enquiry.rejectionReason = reason.slice(0, 500);
  enquiry.respondedAt = new Date();
  await enquiry.save();

  queueAppNotification({
    recipientType: "user",
    recipientId: enquiry.user,
    type: "enquiry_rejected",
    title: "Enquiry declined",
    message: `The venue could not accept enquiry ${enquiry.enquiryNumber}: ${enquiry.rejectionReason}`,
    metadata: {
      event: "enquiry_rejected",
      enquiryId: String(enquiry._id),
      venueId: String(enquiry.venue),
      linkPath: `/enquiries/${enquiry._id}`,
    },
  });

  return respond(req, res, "Enquiry declined", enquiry);
});

/** Private-to-vendor call notes shown back on the enquiry (also visible to the customer as vendorNote). */
exports.updateNote = asyncHandler(async (req, res) => {
  const enquiry = await findVendorEnquiry(req);
  enquiry.vendorNote = String(req.body?.note ?? "").trim().slice(0, 1000);
  await enquiry.save();
  return respond(req, res, "Note saved", enquiry);
});
