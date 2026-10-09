const mongoose = require("mongoose");
const VenueEnquiry = require("../../models/other/venueEnquiry");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination, escapeRegex } = require("../../utils/listQuery");
const { queueAppNotification } = require("../../utils/appNotify");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const { HOUR_MS, expireStaleEnquiries, toEnquiryPayload } = require("../../utils/venueEnquiry");

const VENUE_POPULATE = "name thumbnail city address";
const USER_POPULATE = "name phone email";

function toAdminPayload(row, baseUrl) {
  return {
    ...toEnquiryPayload(row, { baseUrl, audience: "vendor" }),
    vendor: row.vendor || null,
    contact: row.contact,
    cancellationReason: row.cancellationReason || "",
    convertedAt: row.convertedAt || null,
  };
}

exports.listEnquiries = asyncHandler(async (req, res) => {
  await expireStaleEnquiries();
  const { page, limit, skip } = getPagination(req.query);
  const status = String(req.query.status || "").trim().toLowerCase();
  const search = String(req.query.search ?? req.query.q ?? "").trim();

  const filter = {};
  if (status && status !== "all") filter.status = status;
  if (req.query.venueId) {
    assertObjectId(req.query.venueId, "Invalid venueId filter");
    filter.venue = new mongoose.Types.ObjectId(String(req.query.venueId));
  }
  if (req.query.vendorId) {
    assertObjectId(req.query.vendorId, "Invalid vendorId filter");
    filter.vendor = new mongoose.Types.ObjectId(String(req.query.vendorId));
  }
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ enquiryNumber: rx }, { "contact.name": rx }, { "contact.phone": rx }];
  }

  const [rows, total] = await Promise.all([
    VenueEnquiry.find(filter)
      .populate("venue", VENUE_POPULATE)
      .populate("user", USER_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueEnquiry.countDocuments(filter),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  return res.status(200).json({
    status: rows.length > 0,
    message: "Enquiries fetched",
    data: rows.map((row) => toAdminPayload(row, baseUrl)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getEnquiry = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid enquiry id");
  const row = await VenueEnquiry.findById(req.params.id)
    .populate("venue", VENUE_POPULATE)
    .populate("user", USER_POPULATE)
    .lean();
  if (!row) throw new AppError("Enquiry not found", 404);
  return sendSuccess(res, "Enquiry fetched", toAdminPayload(row, getPublicBaseUrl(req)));
});

/** Admin override: accept / reject / cancel on behalf of a vendor (e.g. vendor unreachable). */
exports.updateStatus = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid enquiry id");
  const enquiry = await VenueEnquiry.findById(req.params.id);
  if (!enquiry) throw new AppError("Enquiry not found", 404);

  const next = String(req.body?.status || "").trim().toLowerCase();
  if (!["accepted", "rejected", "cancelled"].includes(next)) {
    throw new AppError("status must be accepted, rejected or cancelled", 400);
  }
  if (!["pending", "accepted"].includes(enquiry.status)) {
    throw new AppError(`Enquiry is already ${enquiry.status}`, 409);
  }

  const now = new Date();
  if (next === "accepted") {
    const settings = await getFeatureSettings();
    enquiry.status = "accepted";
    enquiry.acceptedAt = now;
    enquiry.respondedAt = now;
    enquiry.holdExpiresAt = new Date(now.getTime() + settings.enquiryBookingWindowHours * HOUR_MS);
  } else {
    const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
    if (next === "rejected") {
      if (reason.length < 3) throw new AppError("A reason is required to reject", 400);
      enquiry.rejectionReason = reason;
      enquiry.respondedAt = now;
    } else {
      enquiry.cancellationReason = reason;
    }
    enquiry.status = next;
  }
  await enquiry.save();

  const typeByStatus = {
    accepted: "enquiry_accepted",
    rejected: "enquiry_rejected",
    cancelled: "enquiry_cancelled",
  };
  queueAppNotification({
    recipientType: "user",
    recipientId: enquiry.user,
    type: typeByStatus[next],
    title: `Enquiry ${next}`,
    message: `Your enquiry ${enquiry.enquiryNumber} was ${next} by support.`,
    metadata: { event: typeByStatus[next], enquiryId: String(enquiry._id) },
  });

  const row = await VenueEnquiry.findById(enquiry._id)
    .populate("venue", VENUE_POPULATE)
    .populate("user", USER_POPULATE)
    .lean();
  return sendSuccess(res, `Enquiry ${next}`, toAdminPayload(row, getPublicBaseUrl(req)));
});
