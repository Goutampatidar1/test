const VenueEnquiry = require("../models/other/venueEnquiry");
const AppError = require("./AppError");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { getFeatureSettings } = require("./appFeatureSettings");
const { queueAppNotification } = require("./appNotify");
const {
  parseBookingRequest,
  calculateVenueBookingPricingWithToken,
  formatBookingDateLabel,
  formatBookingSummaryLabel,
} = require("./venueBooking");

const OPEN_STATUSES = ["pending", "accepted"];
const HOUR_MS = 60 * 60 * 1000;

function generateEnquiryNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ENQ-${ts}-${rand}`;
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function hhmmToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Lenient contact builder: enquiries only need a name and phone, taken from the profile by default. */
function buildEnquiryContact(body = {}, user = {}) {
  const source =
    body.contact && typeof body.contact === "object" ? body.contact : body;
  const name = String(source.fullName ?? source.name ?? user.name ?? "").trim();
  const countryCode = String(source.countryCode ?? "+91").trim() || "+91";
  let phone = normalizeDigits(source.mobileNumber ?? source.mobile ?? source.phone ?? user.phone ?? "");
  const codeDigits = normalizeDigits(countryCode);
  if (codeDigits && phone.length > 10 && phone.startsWith(codeDigits)) {
    phone = phone.slice(codeDigits.length);
  }
  if (phone.length === 11 && phone.startsWith("0")) phone = phone.slice(1);

  if (!name) throw new AppError("Your name is required to send an enquiry", 400);
  if (phone.length < 10 || phone.length > 15) {
    throw new AppError("A valid mobile number is required so the venue can call you", 400);
  }

  return {
    name,
    phone,
    email: String(source.email ?? user.email ?? "").trim(),
    countryCode,
    address: String(source.address ?? "").trim(),
  };
}

function hasDateInput(body = {}) {
  return Boolean(
    (Array.isArray(body.bookingDates) && body.bookingDates.length) ||
      body.bookingDate ||
      body.bookingStartDate
  );
}

/**
 * Build the enquiry document fields from a request body.
 * `quick` enquiries may omit dates (the user just wants the venue to call back).
 */
function buildEnquiryFields({ venue, user, body = {}, source = "standard" }) {
  const fields = {
    source,
    bookingType: "full_day",
    bookingDates: [],
    startTime: "",
    endTime: "",
    durationHours: 0,
    slotLabel: "",
    quote: {},
  };

  if (hasDateInput(body)) {
    const bookingRequest = parseBookingRequest(body);
    fields.bookingType = bookingRequest.bookingType;
    fields.bookingDates = bookingRequest.bookingDates;
    fields.startTime = bookingRequest.startTime || "";
    fields.endTime = bookingRequest.endTime || "";
    fields.durationHours = bookingRequest.durationHours || 0;
    fields.slotLabel = bookingRequest.slotLabel || "";

    try {
      const pricing = calculateVenueBookingPricingWithToken(venue, bookingRequest);
      fields.quote = {
        grandTotal: pricing.grandTotal,
        tokenAmount: pricing.tokenAmount ?? 0,
        rateLabel: pricing.rateLabel,
        currency: pricing.currency,
        symbol: pricing.symbol,
      };
    } catch {
      // venue may not be priced for this booking type; the enquiry is still valid
      fields.quote = {};
    }
  } else if (source !== "quick") {
    throw new AppError("bookingDate (or bookingDates) is required", 400);
  }

  const guestCount = Math.max(0, parseInt(String(body.guestCount ?? body.guests ?? "0"), 10) || 0);

  return {
    ...fields,
    guestCount,
    eventType: String(body.eventType ?? "").trim().slice(0, 80),
    message: String(body.message ?? body.note ?? "").trim().slice(0, 1000),
    preferredCallTime: String(body.preferredCallTime ?? "").trim().slice(0, 80),
    contact: buildEnquiryContact(body, user),
  };
}

async function createEnquiry({ venue, user, body, source = "standard" }) {
  const fields = buildEnquiryFields({ venue, user, body, source });
  const settings = await getFeatureSettings();

  const existing = await VenueEnquiry.findOne({
    user: user._id,
    venue: venue._id,
    status: { $in: OPEN_STATUSES },
    bookingDates: fields.bookingDates,
  })
    .select("enquiryNumber status")
    .lean();
  if (existing) {
    throw new AppError(
      `You already have an open enquiry (${existing.enquiryNumber}) for this venue and date.`,
      409,
      "ENQUIRY_ALREADY_OPEN"
    );
  }

  const vendorId =
    String(venue.role || "") === "VenueVendor" ? venue.addedById?._id || venue.addedById : null;

  const enquiry = await VenueEnquiry.create({
    enquiryNumber: generateEnquiryNumber(),
    user: user._id,
    venue: venue._id,
    vendor: vendorId || null,
    ...fields,
    status: "pending",
    responseDueAt: new Date(Date.now() + settings.enquiryResponseHours * HOUR_MS),
  });

  return enquiry;
}

/** Every date the enquiry holds must not overlap another user's booking or an accepted enquiry hold. */
function holdsOverlap(heldEnquiry, bookingRequest) {
  const sharedDate = (heldEnquiry.bookingDates || []).some((d) =>
    bookingRequest.bookingDates.includes(d)
  );
  if (!sharedDate) return false;

  if (heldEnquiry.bookingType === "full_day" || bookingRequest.bookingType === "full_day") {
    return true;
  }

  const heldStart = hhmmToMinutes(heldEnquiry.startTime);
  const heldEnd = hhmmToMinutes(heldEnquiry.endTime);
  if (heldStart === null || heldEnd === null) return true;
  return bookingRequest.startMinutes < heldEnd && bookingRequest.endMinutes > heldStart;
}

async function assertNoEnquiryHold(venueId, bookingRequest, { excludeEnquiryId = null } = {}) {
  const settings = await getFeatureSettings();
  if (!settings.enquiryHoldDatesEnabled) return;

  const filter = {
    venue: venueId,
    status: "accepted",
    holdExpiresAt: { $gt: new Date() },
    bookingDates: { $in: bookingRequest.bookingDates },
  };
  if (excludeEnquiryId) filter._id = { $ne: excludeEnquiryId };

  const holds = await VenueEnquiry.find(filter)
    .select("bookingType bookingDates startTime endTime")
    .lean();

  if (holds.some((hold) => holdsOverlap(hold, bookingRequest))) {
    throw new AppError(
      "These dates are temporarily held for another customer. Please try a different date.",
      409,
      "DATES_HELD"
    );
  }
}

/** Mark overdue enquiries as expired and tell the user. Safe to run often. */
async function expireStaleEnquiries(now = new Date()) {
  const stale = await VenueEnquiry.find({
    $or: [
      { status: "pending", responseDueAt: { $lte: now } },
      { status: "accepted", holdExpiresAt: { $lte: now } },
    ],
  })
    .select("_id user venue enquiryNumber status")
    .limit(500)
    .lean();

  let expired = 0;
  for (const row of stale) {
    const res = await VenueEnquiry.updateOne(
      { _id: row._id, status: row.status },
      { $set: { status: "expired" } }
    );
    if (!res.modifiedCount) continue;
    expired += 1;
    queueAppNotification({
      recipientType: "user",
      recipientId: row.user,
      type: "enquiry_expired",
      title: "Enquiry expired",
      message:
        row.status === "accepted"
          ? `The booking window for enquiry ${row.enquiryNumber} has closed. Send a new enquiry to book.`
          : `Enquiry ${row.enquiryNumber} was not answered in time. You can send it again.`,
      metadata: {
        event: "enquiry_expired",
        enquiryId: String(row._id),
        venueId: String(row.venue),
        linkPath: `/enquiries/${row._id}`,
      },
    });
  }
  return expired;
}

function statusLabel(status) {
  switch (status) {
    case "pending":
      return "Waiting for venue";
    case "accepted":
      return "Accepted — ready to book";
    case "rejected":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "converted":
      return "Booked";
    default:
      return status;
  }
}

function toEnquiryPayload(enquiry, { baseUrl = "", audience = "user", vendorContact = null } = {}) {
  const row = typeof enquiry.toObject === "function" ? enquiry.toObject() : enquiry;
  const venue = row.venue && typeof row.venue === "object" && row.venue._id ? row.venue : null;
  const user = row.user && typeof row.user === "object" && row.user._id ? row.user : null;
  const now = Date.now();
  const holdMs = row.holdExpiresAt ? new Date(row.holdExpiresAt).getTime() - now : null;

  const payload = {
    _id: row._id,
    enquiryNumber: row.enquiryNumber,
    status: row.status,
    statusLabel: statusLabel(row.status),
    source: row.source,
    venue: venue
      ? {
          _id: venue._id,
          name: venue.name,
          thumbnail: toAbsoluteUploadUrl(venue.thumbnail, baseUrl),
          city: venue.city || "",
          address: venue.address || "",
        }
      : { _id: row.venue },
    bookingType: row.bookingType,
    bookingDates: row.bookingDates || [],
    dateLabel: row.bookingDates?.length ? formatBookingDateLabel(row.bookingDates) : "Flexible dates",
    startTime: row.startTime || null,
    endTime: row.endTime || null,
    slotLabel: row.slotLabel || null,
    summaryLabel: row.bookingDates?.length
      ? formatBookingSummaryLabel({
          bookingType: row.bookingType,
          bookingDates: row.bookingDates,
          slotLabel: row.slotLabel,
          durationLabel: row.durationHours ? `${row.durationHours} hr` : "",
        })
      : "Flexible dates",
    guestCount: row.guestCount || 0,
    eventType: row.eventType || "",
    message: row.message || "",
    preferredCallTime: row.preferredCallTime || "",
    quote: row.quote || {},
    vendorNote: row.vendorNote || "",
    rejectionReason: row.rejectionReason || "",
    responseDueAt: row.responseDueAt,
    acceptedAt: row.acceptedAt,
    holdExpiresAt: row.holdExpiresAt,
    holdSecondsRemaining:
      row.status === "accepted" && holdMs !== null ? Math.max(0, Math.floor(holdMs / 1000)) : null,
    canCancel: OPEN_STATUSES.includes(row.status),
    canBook: row.status === "accepted" && (holdMs === null || holdMs > 0),
    orderId: row.order?._id || row.order || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (audience === "vendor") {
    payload.customer = {
      _id: user?._id || row.user,
      name: row.contact?.name || user?.name || "",
      phone: row.contact?.phone || user?.phone || "",
      countryCode: row.contact?.countryCode || "+91",
      email: row.contact?.email || "",
    };
    payload.canRespond = row.status === "pending";
  } else if (vendorContact) {
    payload.vendorContact = vendorContact;
  }

  return payload;
}

/** Turn an accepted enquiry into the booking request body used by the booking flow. */
function bookingBodyFromEnquiry(enquiry, overrides = {}) {
  const contactDefaults = {
    name: enquiry.contact?.name,
    mobileNumber: enquiry.contact?.phone,
    countryCode: enquiry.contact?.countryCode,
    email: enquiry.contact?.email,
    address: enquiry.contact?.address || "Shared during enquiry call",
    notes: enquiry.message || "",
  };
  const body = { ...contactDefaults, ...overrides };

  // Dates agreed in the enquiry are authoritative; flexible (quick) enquiries take them from the request.
  if (enquiry.bookingDates?.length) {
    body.bookingType = enquiry.bookingType;
    body.bookingDates = enquiry.bookingDates;
    body.startTime = enquiry.startTime;
    body.endTime = enquiry.endTime;
    delete body.bookingDate;
    delete body.bookingStartDate;
    delete body.bookingEndDate;
  }
  return body;
}

async function loadBookableEnquiry(enquiryId, userId) {
  await expireStaleEnquiries();
  const enquiry = await VenueEnquiry.findOne({ _id: enquiryId, user: userId });
  if (!enquiry) throw new AppError("Enquiry not found", 404);
  if (enquiry.status === "converted") {
    throw new AppError("This enquiry has already been booked", 409, "ENQUIRY_CONVERTED");
  }
  if (enquiry.status === "pending") {
    throw new AppError(
      "The venue has not accepted this enquiry yet. You can book once it is accepted.",
      409,
      "ENQUIRY_NOT_ACCEPTED"
    );
  }
  if (enquiry.status !== "accepted") {
    throw new AppError(`This enquiry is ${enquiry.status}. Please send a new enquiry.`, 409, "ENQUIRY_CLOSED");
  }
  if (enquiry.holdExpiresAt && enquiry.holdExpiresAt.getTime() <= Date.now()) {
    throw new AppError("The booking window for this enquiry has closed.", 409, "ENQUIRY_EXPIRED");
  }
  return enquiry;
}

module.exports = {
  OPEN_STATUSES,
  HOUR_MS,
  createEnquiry,
  buildEnquiryFields,
  assertNoEnquiryHold,
  expireStaleEnquiries,
  toEnquiryPayload,
  bookingBodyFromEnquiry,
  loadBookableEnquiry,
  statusLabel,
};
