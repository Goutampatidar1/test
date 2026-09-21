const Venue = require("../../models/other/venue");
const VenueOrder = require("../../models/other/venueOrder");
const VenueTransaction = require("../../models/other/venueTransaction");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl, toAbsoluteUploadUrl } = require("../../utils/mediaUrl");
const { toMobileUserProfile } = require("../../utils/toPublicProfile");
const {
  parseBookingRequest,
  parseAvailabilityRequest,
  generateVenueOrderNumber,
  calculateVenueBookingPricing,
  calculateVenueBookingPricingWithToken,
  buildOrderItems,
  buildOrderPaymentSnapshot,
  resolvePayableAmountForOrder,
  resolvePaymentAmountFromBody,
  assertVenueAvailableForBooking,
  getVenueAvailabilityByDates,
  formatBookingDateLabel,
  formatBookingSummaryLabel,
  getVenueDayPrice,
  getVenueHourlyPrice,
  parseBookingCustomer,
} = require("../../utils/venueBooking");
const {
  buildBookingHistoryList,
  paginateBookings,
  toBookingDetailPayload,
} = require("../../utils/venueBookingHistory");
const { getPagination } = require("../../utils/listQuery");
const { parseDateRangeFromQuery } = require("../../utils/dateOnly");
const {
  createVenueTransactionForOrder,
  cancelVenueTransactionForOrder,
  markVenueOrderPaymentPaid,
  isVenuePaymentConfirmed,
  readGatewayPaymentId,
} = require("../../utils/venueTransaction");
const { extractBookingDatesFromOrder } = require("../../utils/venueBookingHistory");
const { formatDateOnly } = require("../../utils/dateOnly");
const { queueNotifyAllAdmins } = require("../../utils/adminInbox");
const { queueNotifyVenueVendorBookingPlaced } = require("../../utils/venueVendorInbox");
const { toVenueTransactionHistoryItem } = require("../../utils/transactionHistory");
const {
  attachVenueBookingInvoice,
  getUserVenueBookingInvoice,
} = require("../../utils/venueBookingInvoice");
const { sendInvoiceResponse } = require("../../utils/ecomInvoiceResponse");
const {
  canRateBooking,
  getUserVenueRatingForBooking,
  getRatingStatsForVenues,
  getPrimaryVenueIdFromOrder,
  toUserVenueRatingPayload,
} = require("../../utils/venueRating");
const { formatRatingValue } = require("../../utils/productRating");
const { activePublicVenueListingFilterOpen } = require("../../utils/publicVenueList");

async function activePublicVenueFilter(extra = {}) {
  return activePublicVenueListingFilterOpen(extra);
}

function formatVenueLocation(venue) {
  const cityState = [venue.city, venue.state].filter(Boolean).join(", ");
  if (cityState) return cityState;
  return venue.address || "";
}

function toBookingVenueCard(venue, baseUrl) {
  const dayPrice = getVenueDayPrice(venue);
  const hourlyPrice = getVenueHourlyPrice(venue);

  return {
    _id: venue._id,
    name: venue.name,
    thumbnail: toAbsoluteUploadUrl(venue.thumbnail, baseUrl),
    location: formatVenueLocation(venue),
    basePrice: dayPrice,
    dayPrice,
    hourlyPrice,
    price: {
      amount: dayPrice,
      currency: "INR",
      symbol: "₹",
      period: "day",
    },
    hourlyRate: {
      amount: hourlyPrice,
      currency: "INR",
      symbol: "₹",
      period: "hour",
      label: hourlyPrice > 0 ? `₹${hourlyPrice}/hr` : null,
    },
    dayRate: {
      amount: dayPrice,
      currency: "INR",
      symbol: "₹",
      period: "day",
      label: dayPrice > 0 ? `₹${dayPrice}/day` : null,
    },
    tokenAmountPercentage: Number(venue.tokenAmountPercentage) || 0,
    rating: null,
  };
}

function bookingInputFromRequest(req) {
  if (req.method === "GET") {
    const q = req.query;
    if (q.bookingDates) {
      const raw = q.bookingDates;
      const arr =
        typeof raw === "string"
          ? raw.split(",").map((s) => s.trim()).filter(Boolean)
          : Array.isArray(raw)
            ? raw
            : [];
      return { ...q, bookingDates: arr };
    }
    // Support range in query: bookingDate + bookingEndDate (or bookingStartDate + bookingEndDate)
    return {
      ...q,
      bookingDate: q.bookingDate ?? q.bookingStartDate,
      bookingStartDate: q.bookingStartDate ?? q.bookingDate,
      bookingEndDate: q.bookingEndDate,
    };
  }
  return req.body ?? {};
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function availabilityInputFromRequest(req) {
  const input = bookingInputFromRequest(req);
  const start = firstNonEmpty(
    input.bookingStartDate,
    input.bookingDate,
    input.startDate,
    input.from,
    input.date
  );
  const end = firstNonEmpty(
    input.bookingEndDate,
    input.endDate,
    input.to,
    start
  );
  return {
    ...input,
    bookingDate: start,
    bookingStartDate: start,
    bookingEndDate: end,
    bookingType: input.bookingType || "full_day",
  };
}

async function loadBookableVenue(venueId) {
  assertObjectId(venueId, "Invalid venue id");
  const venue = await Venue.findOne(await activePublicVenueFilter({ _id: venueId }))
    .select("name thumbnail address city state basePrice dayPrice hourlyPrice priceType tokenAmount tokenAmountPercentage status adminApproved")
    .lean();
  if (!venue) throw new AppError("Venue not found", 404);
  return venue;
}

function buildBookingPaymentSummary(pricing) {
  return {
    tokenAmountPercentage: pricing.tokenAmountPercentage ?? 0,
    tokenAmount: pricing.tokenAmount ?? 0,
    remainingAmount: pricing.remainingAmount ?? pricing.grandTotal ?? 0,
    amountDueNow: pricing.amountDueNow ?? pricing.grandTotal ?? 0,
    usesTokenPayment: Boolean(pricing.usesTokenPayment),
  };
}

function buildBookingPreviewPayload({ venue, bookingRequest, pricing, available, req }) {
  const baseUrl = getPublicBaseUrl(req);
  const dateLabel = formatBookingDateLabel(bookingRequest.bookingDates);
  const summaryLabel = formatBookingSummaryLabel(bookingRequest);

  return {
    venue: toBookingVenueCard(venue, baseUrl),
    bookingType: bookingRequest.bookingType,
    bookingDate: bookingRequest.bookingDates[0] ?? null,
    bookingDates: bookingRequest.bookingDates,
    dateLabel,
    startTime: bookingRequest.startTime || null,
    endTime: bookingRequest.endTime || null,
    durationHours: bookingRequest.durationHours || 0,
    timeSlotLabel:
      bookingRequest.bookingType === "hourly"
        ? `${bookingRequest.slotLabel} · ${bookingRequest.durationLabel}`
        : null,
    available,
    availabilityMessage: available
      ? "Slot available for immediate booking."
      : bookingRequest.bookingType === "hourly"
        ? "Selected time slot is not available."
        : "Selected dates are not available.",
    customer: toMobileUserProfile(req.user, req),
    summary: {
      dateLabel,
      summaryLabel,
      bookingType: bookingRequest.bookingType,
      rate: pricing.rateLabel,
      hourlyRate: pricing.hourlyRate,
      dayRate: pricing.dayRate,
      durationHours: pricing.durationHours,
      venueFee: pricing.venueFee,
      discountTotal: pricing.discountTotal,
      taxTotal: pricing.taxTotal,
      subTotal: pricing.subTotal,
      grandTotal: pricing.grandTotal,
      currency: pricing.currency,
      symbol: pricing.symbol,
      ...buildBookingPaymentSummary(pricing),
    },
    totalAmount: pricing.grandTotal,
    amountDueNow: pricing.amountDueNow,
  };
}

/** Check if a venue is free on a date or date range. Does not create a booking. */
exports.checkVenueAvailability = asyncHandler(async (req, res) => {
  const venue = await loadBookableVenue(req.params.venueId);
  const bookingRequest = parseAvailabilityRequest(availabilityInputFromRequest(req));
  const result = await getVenueAvailabilityByDates(venue._id, bookingRequest);
  const startDate = bookingRequest.bookingDates[0] ?? null;
  const endDate = bookingRequest.bookingDates[bookingRequest.bookingDates.length - 1] ?? null;

  sendSuccess(res, result.message, {
    venueId: String(venue._id),
    venueName: venue.name,
    available: result.available,
    bookingType: bookingRequest.bookingType,
    bookingStartDate: startDate,
    bookingEndDate: endDate,
    bookingDate: startDate,
    bookingDates: bookingRequest.bookingDates,
    dates: result.dates,
    availableDates: result.dates.filter((row) => row.available).map((row) => row.date),
    unavailableDates: result.dates.filter((row) => !row.available).map((row) => row.date),
    startTime: bookingRequest.startTime || null,
    endTime: bookingRequest.endTime || null,
    message: result.message,
  });
});

/** Book Venue screen — venue, customer, pricing, availability */
exports.getBookingPreview = asyncHandler(async (req, res) => {
  const venue = await loadBookableVenue(req.params.venueId);
  const bookingRequest = parseBookingRequest(bookingInputFromRequest(req));

  let available = true;
  try {
    await assertVenueAvailableForBooking(venue._id, bookingRequest);
  } catch (e) {
    if (e?.statusCode === 409) {
      available = false;
    } else {
      throw e;
    }
  }

  const pricing = calculateVenueBookingPricingWithToken(venue, bookingRequest);
  const payload = buildBookingPreviewPayload({ venue, bookingRequest, pricing, available, req });

  sendSuccess(res, "Booking preview fetched", payload);
});

/** Book Now — create venue order */
exports.createBooking = asyncHandler(async (req, res) => {
  const venue = await loadBookableVenue(req.params.venueId);
  const bookingRequest = parseBookingRequest(req.body ?? {});
  await assertVenueAvailableForBooking(venue._id, bookingRequest);

  const pricing = calculateVenueBookingPricingWithToken(venue, bookingRequest);
  const payNowAmount = resolvePaymentAmountFromBody(req.body ?? {}, pricing);

  const items = buildOrderItems(venue, bookingRequest, pricing);
  const addressSnapshot = parseBookingCustomer(req.body ?? {}, req.user);
  const paymentSnapshot = buildOrderPaymentSnapshot(pricing);

  const paymentMethod = String(req.body?.paymentMethod || "online").trim().toLowerCase();
  const allowedMethods = new Set(["cod", "online", "wallet"]);
  if (!allowedMethods.has(paymentMethod)) {
    throw new AppError("Invalid paymentMethod. Use cod, online, or wallet", 400);
  }

  const notes = String(req.body?.notes || "").trim();
  const shouldApplyPayment =
    paymentMethod === "wallet" ||
    (paymentMethod === "online" && isVenuePaymentConfirmed(req.body ?? {}));

  const order = await VenueOrder.create({
    orderNumber: generateVenueOrderNumber(),
    user: req.user._id,
    items,
    subTotal: pricing.subTotal,
    discountTotal: pricing.discountTotal,
    taxTotal: pricing.taxTotal,
    grandTotal: pricing.grandTotal,
    ...paymentSnapshot,
    paymentMethod,
    paymentStatus: "pending",
    orderStatus: "pending",
    notes,
    addressSnapshot,
    placedAt: new Date(),
  });

  const transaction = await createVenueTransactionForOrder(order, {
    paymentPhase: pricing.usesTokenPayment ? "token" : "full",
    amount: payNowAmount,
  });

  if (shouldApplyPayment) {
    await markVenueOrderPaymentPaid(order, {
      paidAmount: payNowAmount,
      gatewayPaymentId: readGatewayPaymentId(req.body ?? {}),
      gateway: String(req.body?.gateway || req.body?.paymentGateway || "razorpay").trim(),
      gatewayOrderId: String(req.body?.gatewayOrderId || req.body?.razorpay_order_id || "").trim(),
      providerResponse: req.body?.providerResponse,
    });
  }

  const fresh = await VenueOrder.findById(order._id)
    .populate("items.venue", "name thumbnail address city basePrice dayPrice hourlyPrice")
    .lean();

  const paymentTx = await VenueTransaction.findOne({ order: order._id, type: "payment" }).lean();

  queueNotifyAllAdmins({
    type: "venue_booking_placed",
    title: "New venue booking",
    message: `Booking ${fresh.orderNumber} was placed for ${venue.name}.`,
    orderNumber: fresh.orderNumber,
    orderStatus: fresh.orderStatus,
    metadata: {
      event: "venue_booking_placed",
      venueId: String(venue._id),
      bookingId: String(fresh._id),
      linkPath: `/admin/orders/venue/${fresh._id}`,
    },
  });
  queueNotifyVenueVendorBookingPlaced(venue, fresh);

  sendSuccess(res, "Venue booked successfully", {
    order: fresh,
    orderNumber: fresh.orderNumber,
    orderId: fresh._id,
    bookingType: bookingRequest.bookingType,
    bookingDate: bookingRequest.bookingDates[0] ?? null,
    bookingDates: bookingRequest.bookingDates,
    dateLabel: formatBookingDateLabel(bookingRequest.bookingDates),
    summaryLabel: formatBookingSummaryLabel(bookingRequest),
    startTime: bookingRequest.startTime || null,
    endTime: bookingRequest.endTime || null,
    durationHours: bookingRequest.durationHours || 0,
    summary: {
      venueFee: pricing.venueFee,
      subTotal: pricing.subTotal,
      grandTotal: pricing.grandTotal,
      currency: pricing.currency,
      symbol: pricing.symbol,
      ...buildBookingPaymentSummary(pricing),
    },
    totalAmount: fresh.grandTotal,
    amountDueNow: pricing.amountDueNow,
    amountPaid: fresh.amountPaid ?? 0,
    remainingAmount: fresh.remainingAmount ?? 0,
    paymentStatus: fresh.paymentStatus,
    orderStatus: fresh.orderStatus,
    transaction: toVenueTransactionHistoryItem(paymentTx ?? transaction, fresh),
  });
});

/** Confirm online payment after gateway success */
exports.confirmBookingPayment = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");

  const order = await VenueOrder.findOne({ _id: bookingId, user: req.user._id });
  if (!order) throw new AppError("Booking not found", 404);

  const method = String(order.paymentMethod || "").toLowerCase();
  if (method === "cod") {
    throw new AppError("Cash bookings do not require online payment confirmation", 400);
  }

  if (String(order.paymentStatus || "").toLowerCase() === "paid") {
    const fresh = await VenueOrder.findById(order._id)
      .populate("items.venue", "name thumbnail address city basePrice dayPrice hourlyPrice")
      .lean();
    const tx = await VenueTransaction.findOne({ order: order._id, type: "payment" })
      .sort({ createdAt: -1 })
      .lean();
    return sendSuccess(res, "Payment already confirmed", {
      order: fresh,
      transaction: tx ? toVenueTransactionHistoryItem(tx, fresh) : null,
    });
  }

  const payableNow = resolvePayableAmountForOrder(order);
  const paidAmount = resolvePaymentAmountFromBody(req.body ?? {}, {
    grandTotal: order.grandTotal,
    amountDueNow: payableNow,
  });

  const { order: paidOrder, transaction } = await markVenueOrderPaymentPaid(order, {
    paidAmount,
    gatewayPaymentId: readGatewayPaymentId(req.body ?? {}),
    gateway: String(req.body?.gateway || req.body?.paymentGateway || "razorpay").trim(),
    gatewayOrderId: String(req.body?.gatewayOrderId || req.body?.razorpay_order_id || "").trim(),
    providerResponse: req.body?.providerResponse,
  });

  const fresh = await VenueOrder.findById(paidOrder._id)
    .populate("items.venue", "name thumbnail address city basePrice dayPrice hourlyPrice")
    .lean();

  const message =
    String(fresh.paymentStatus || "").toLowerCase() === "partially_paid"
      ? "Token payment confirmed. Booking confirmed."
      : "Booking payment confirmed";

  sendSuccess(res, message, {
    order: fresh,
    transaction: transaction ? toVenueTransactionHistoryItem(transaction, fresh) : null,
    amountPaid: fresh.amountPaid ?? 0,
    remainingAmount: fresh.remainingAmount ?? 0,
  });
});

/** User's venue bookings list (raw orders) */
exports.listMyBookings = asyncHandler(async (req, res) => {
  const orders = await VenueOrder.find({ user: req.user._id })
    .populate("items.venue", "name thumbnail address city basePrice dayPrice hourlyPrice")
    .sort({ createdAt: -1 })
    .lean();

  sendSuccess(res, "Venue bookings fetched", orders);
});

/** Booking History — mobile list */
exports.getBookingHistory = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const statusFilter = req.query.status
    ? String(req.query.status).trim().toLowerCase()
    : null;
  const dateRange = parseDateRangeFromQuery(req.query);

  const orderFilter = { user: req.user._id };
  if (dateRange?.mongoRange) {
    orderFilter.items = {
      $elemMatch: {
        bookingDate: dateRange.mongoRange,
      },
    };
  }

  const orders = await VenueOrder.find(orderFilter)
    .populate("items.venue", "name thumbnail address city")
    .sort({ createdAt: -1 })
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const allBookings = buildBookingHistoryList(orders, baseUrl, toAbsoluteUploadUrl, {
    status: statusFilter,
  });
  const { bookings, total, pages } = paginateBookings(allBookings, page, limit);

  return res.status(200).json({
    status: bookings.length > 0,
    message: "Booking history fetched",
    data: bookings,
    pagination: {
      page,
      limit,
      total,
      pages,
    },
    filters: {
      status: statusFilter,
      startDate: dateRange?.startDate ?? null,
      endDate: dateRange?.endDate ?? null,
      filterBy: dateRange ? "bookingDate" : null,
    },
  });
});

const NON_CANCELLABLE_ORDER_STATUSES = new Set(["cancelled", "refunded"]);

function resolveBookingIdParam(req) {
  return req.params.bookingId ?? req.params.id;
}

/** Cancel booking — reason required */
exports.cancelBooking = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");

  const reason = String(
    req.body?.reason ?? req.body?.cancellationReason ?? ""
  ).trim();
  if (!reason) {
    throw new AppError("Cancellation reason is required", 400);
  }

  const order = await VenueOrder.findOne({ _id: bookingId, user: req.user._id });
  if (!order) throw new AppError("Booking not found", 404);

  if (NON_CANCELLABLE_ORDER_STATUSES.has(order.orderStatus)) {
    throw new AppError("Booking is already cancelled", 400);
  }

  const bookingDates = extractBookingDatesFromOrder(order);
  const today = formatDateOnly(new Date());
  const lastBookingDate = bookingDates[bookingDates.length - 1];
  if (lastBookingDate && lastBookingDate < today) {
    throw new AppError("Cannot cancel a completed booking", 400);
  }

  order.orderStatus = "cancelled";
  order.cancellationReason = reason;
  order.cancelledAt = new Date();

  if (order.paymentStatus === "paid" || order.paymentStatus === "partially_paid") {
    order.paymentStatus = "refunded";
  } else if (order.paymentStatus === "pending") {
    order.paymentStatus = "failed";
  }

  await order.save();
  await cancelVenueTransactionForOrder(order, reason);

  const fresh = await VenueOrder.findById(order._id)
    .populate("items.venue", "name thumbnail address city basePrice dayPrice hourlyPrice")
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const payload = {
    ...toBookingDetailPayload(fresh, baseUrl, toAbsoluteUploadUrl),
    ...attachVenueBookingInvoice(fresh, baseUrl),
  };

  sendSuccess(res, "Booking cancelled successfully", payload);
});

/** Single booking detail */
exports.getMyBookingById = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");
  const order = await VenueOrder.findOne({ _id: bookingId, user: req.user._id })
    .populate("items.venue", "name thumbnail address city basePrice dayPrice hourlyPrice")
    .lean();

  if (!order) throw new AppError("Booking not found", 404);

  const baseUrl = getPublicBaseUrl(req);
  const venueId = getPrimaryVenueIdFromOrder(order);
  const [savedReview, statsMap] = await Promise.all([
    getUserVenueRatingForBooking(req.user._id, bookingId),
    venueId ? getRatingStatsForVenues([venueId]) : Promise.resolve(new Map()),
  ]);
  const venueStats = venueId ? statsMap.get(String(venueId)) : null;

  const payload = {
    ...toBookingDetailPayload(order, baseUrl, toAbsoluteUploadUrl),
    ...attachVenueBookingInvoice(order, baseUrl),
    canRate: canRateBooking(order),
    myReview: savedReview
      ? toUserVenueRatingPayload(bookingId, venueId, savedReview, {
          averageRating:
            venueStats?.rating ??
            formatRatingValue(venueStats?.averageRating, venueStats?.ratingCount),
          ratingCount: venueStats?.ratingCount ?? 0,
        })
      : null,
    venueRating: venueStats
      ? {
          averageRating: venueStats.rating,
          ratingCount: venueStats.ratingCount,
        }
      : { averageRating: null, ratingCount: 0 },
  };
  sendSuccess(res, "Booking details fetched", payload);
});

/** Booking invoice — HTML, PDF, or JSON */
exports.getBookingInvoice = asyncHandler(async (req, res) => {
  const bookingId = resolveBookingIdParam(req);
  assertObjectId(bookingId, "Invalid booking id");
  const baseUrl = getPublicBaseUrl(req);
  const invoice = await getUserVenueBookingInvoice(req.user._id, bookingId, baseUrl);
  return sendInvoiceResponse(req, res, invoice, "Booking invoice fetched");
});
