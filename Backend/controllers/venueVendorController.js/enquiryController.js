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

/** Normalize list `source` query: callback requests are stored as `quick`. */
function normalizeEnquirySourceFilter(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "quick" || value === "callback") return "quick";
  if (value === "standard") return "standard";
  return null;
}

async function buildVendorEnquirySummary(vendorId) {
  const [bySourceStatus, byStatus] = await Promise.all([
    VenueEnquiry.aggregate([
      { $match: { vendor: vendorId } },
      {
        $group: {
          _id: {
            source: "$source",
            status: "$status",
            unread: { $ne: ["$vendorUnread", false] },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    VenueEnquiry.aggregate([
      { $match: { vendor: vendorId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const quick = { total: 0, pending: 0, unread: 0 };
  const standard = { total: 0, pending: 0, unread: 0 };
  for (const row of bySourceStatus) {
    const bucket = row._id?.source === "quick" ? quick : standard;
    bucket.total += row.count;
    if (row._id?.status === "pending") {
      bucket.pending += row.count;
      if (row._id?.unread) bucket.unread += row.count;
    }
  }

  const statusSummary = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  return {
    pendingStandard: standard.pending,
    pendingQuick: quick.pending,
    unreadStandard: standard.unread,
    unreadQuick: quick.unread,
    totalStandard: standard.total,
    totalQuick: quick.total,
    quick: { total: quick.total, pending: quick.pending, unread: quick.unread },
    standard: { total: standard.total, pending: standard.pending, unread: standard.unread },
    pending: statusSummary.pending || 0,
    accepted: statusSummary.accepted || 0,
    rejected: statusSummary.rejected || 0,
    converted: statusSummary.converted || 0,
    expired: statusSummary.expired || 0,
    cancelled: statusSummary.cancelled || 0,
  };
}

exports.listEnquiries = asyncHandler(async (req, res) => {
  await expireStaleEnquiries();
  const { page, limit, skip } = getPagination(req.query);
  const status = String(req.query.status || "").trim().toLowerCase();
  const source = normalizeEnquirySourceFilter(req.query.source);
  const search = String(req.query.search ?? req.query.q ?? "").trim();
  const vendorId = new mongoose.Types.ObjectId(String(req.auth.sub));

  const filter = { vendor: req.auth.sub };
  if (status && status !== "all") filter.status = status;
  if (source) filter.source = source;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ enquiryNumber: rx }, { "contact.name": rx }, { "contact.phone": rx }];
  }

  const [rows, total, summary] = await Promise.all([
    VenueEnquiry.find(filter)
      .populate("venue", VENUE_POPULATE)
      .populate("user", USER_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueEnquiry.countDocuments(filter),
    buildVendorEnquirySummary(vendorId),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const data = rows.map((row) => toEnquiryPayload(row, { baseUrl, audience: "vendor" }));

  return res.status(200).json({
    status: data.length > 0,
    message: "Enquiries fetched",
    data,
    summary,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    filters: {
      status: status || "all",
      source: source || "all",
      search: search || null,
    },
  });
});

/** Clear vendor-unread for every enquiry in a source segment (quick/callback or standard). */
exports.markSegmentSeen = asyncHandler(async (req, res) => {
  const source = normalizeEnquirySourceFilter(req.body?.source);
  if (!source) {
    throw new AppError('source must be "quick", "callback", or "standard"', 400);
  }

  const result = await VenueEnquiry.updateMany(
    {
      vendor: req.auth.sub,
      source,
      vendorUnread: { $ne: false },
    },
    { $set: { vendorUnread: false } }
  );

  const summary = await buildVendorEnquirySummary(
    new mongoose.Types.ObjectId(String(req.auth.sub))
  );

  return res.status(200).json({
    status: true,
    message: "Segment marked as seen",
    data: [
      {
        source,
        cleared: result.modifiedCount || 0,
        summary: {
          pendingQuick: summary.pendingQuick,
          pendingStandard: summary.pendingStandard,
          unreadQuick: summary.unreadQuick,
          unreadStandard: summary.unreadStandard,
          quick: summary.quick,
          standard: summary.standard,
        },
      },
    ],
  });
});

/** Mark a single enquiry/callback as read for the vendor. */
exports.markEnquiryRead = asyncHandler(async (req, res) => {
  const enquiry = await findVendorEnquiry(req);
  if (enquiry.vendorUnread !== false) {
    enquiry.vendorUnread = false;
    await enquiry.save();
  }
  return respond(req, res, "Enquiry marked as read", enquiry);
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
  enquiry.vendorUnread = false;
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
  enquiry.vendorUnread = false;
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
  const note = String(req.body?.note ?? "").trim().slice(0, 1000);
  if (note !== (enquiry.vendorNote || "")) {
    enquiry.vendorNote = note;
    enquiry.userUnread = true;
  }
  await enquiry.save();
  return respond(req, res, "Note saved", enquiry);
});
