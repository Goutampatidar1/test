const mongoose = require("mongoose");
const Venue = require("../models/other/venue");
const VenueOrder = require("../models/other/venueOrder");
const VenueTransaction = require("../models/other/venueTransaction");
const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");
const { formatDateOnly } = require("./dateOnly");
const {
  extractBookingDatesFromOrder,
  toAddressSnapshotFromOrder,
} = require("./venueBookingHistory");
const {
  attachVenueBookingInvoice,
  computeBookingAmounts,
  ensureVenueBookingInvoicePdf,
} = require("./venueBookingInvoice");
const {
  markVenueOrderPaymentPaid,
} = require("./venueTransaction");
const { buildBookingPaymentSummary } = require("./venueBooking");

const PAYMENT_METHOD_LABELS = {
  cod: "Cash on delivery",
  online: "Online payment",
  wallet: "Wallet",
};

const VENDOR_ALLOWED_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "cancelled",
]);

function mapOrderStatusToUi(orderStatus) {
  const status = String(orderStatus || "").toLowerCase();
  if (status === "cancelled" || status === "refunded") return "cancelled";
  if (status === "pending") return "pending";
  return "confirmed";
}

function mapPaymentStatusToUi(paymentStatus, transactionStatus) {
  const status = String(paymentStatus || "").toLowerCase();
  if (status === "partially_paid") return "partially_paid";
  if (status === "paid") return "paid";
  if (status === "refunded" || status === "partially_refunded") return "refunded";

  const txStatus = String(transactionStatus || "").toLowerCase();
  if (txStatus === "success") return "paid";
  return "pending";
}

function formatPaymentStatusLabel(status) {
  const labels = {
    paid: "Paid",
    partially_paid: "Partially paid",
    pending: "Pending",
    refunded: "Refunded",
  };
  return labels[String(status || "").toLowerCase()] || status || "Pending";
}

function formatBookingTime(item) {
  if (!item) return "—";
  const start = String(item.startTime || "").trim();
  const end = String(item.endTime || "").trim();
  if (start && end) return `${start} - ${end}`;
  if (item.bookingSlot) return String(item.bookingSlot);
  if (item.bookingType === "hourly" && item.durationHours) {
    return `${item.durationHours} hour(s)`;
  }
  return "Full day";
}

function formatVenueLocation(venue) {
  if (!venue || typeof venue !== "object") return "";
  const cityState = [venue.city, venue.state].filter(Boolean).join(", ");
  if (cityState) return cityState;
  return venue.address || "";
}

function formatVenueAddress(venue) {
  if (!venue || typeof venue !== "object") return "";
  return [venue.address, venue.city, venue.state, venue.pincode].filter(Boolean).join(", ");
}

async function getVendorVenueIds(vendorId) {
  const venues = await Venue.find({
    addedById: vendorId,
    role: "VenueVendor",
  })
    .select("_id")
    .lean();
  return venues.map((venue) => venue._id);
}

function buildVendorOrdersFilter(vendorVenueIds, { status, search } = {}) {
  const filter = { "items.venue": { $in: vendorVenueIds } };

  if (status === "cancelled") {
    filter.orderStatus = { $in: ["cancelled", "refunded"] };
  } else if (status === "pending") {
    filter.orderStatus = "pending";
  } else if (status === "confirmed") {
    filter.orderStatus = { $in: ["confirmed", "processing", "shipped", "delivered"] };
  }

  const query = String(search || "").trim();
  if (query) {
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { orderNumber: pattern },
      { "addressSnapshot.name": pattern },
      { "items.name": pattern },
    ];
  }

  return filter;
}

function getPrimaryItemForVendor(order, vendorVenueIds) {
  const vendorVenueSet = new Set(vendorVenueIds.map(String));
  return (
    (order.items ?? []).find((item) => vendorVenueSet.has(String(item.venue?._id ?? item.venue))) ??
    order.items?.[0] ??
    null
  );
}

function resolveCustomerName(order) {
  const snap = toAddressSnapshotFromOrder(order);
  if (snap.name) return snap.name;
  if (order.user && typeof order.user === "object" && order.user.name) {
    return String(order.user.name).trim();
  }
  return "Customer";
}

function toVendorBookingListRow(order, vendorVenueIds, transactionStatus) {
  const item = getPrimaryItemForVendor(order, vendorVenueIds);
  const venue = item?.venue;
  const venueName =
    venue && typeof venue === "object" ? venue.name : String(item?.name || "Venue");
  const bookingDates = extractBookingDatesFromOrder(order);
  const paymentSummary = buildBookingPaymentSummary(order);

  return {
    id: order.orderNumber,
    orderId: String(order._id),
    customer: resolveCustomerName(order),
    venue: venueName,
    date: bookingDates[0] || formatDateOnly(order.placedAt) || "",
    amount: paymentSummary.grandTotal,
    grandTotal: paymentSummary.grandTotal,
    tokenAmountPercentage: paymentSummary.tokenAmountPercentage,
    tokenAmount: paymentSummary.tokenAmount,
    amountPaid: paymentSummary.amountPaid,
    remainingAmount: paymentSummary.remainingAmount,
    amountDueNow: paymentSummary.amountDueNow,
    status: mapOrderStatusToUi(order.orderStatus),
    paymentStatus: mapPaymentStatusToUi(order.paymentStatus, transactionStatus),
    orderStatus: order.orderStatus,
    paymentStatusRaw: order.paymentStatus,
    payment: paymentSummary,
    placedAt: order.placedAt ?? order.createdAt,
  };
}

async function loadVendorBookingOrder(vendorId, bookingRef, { populate = true } = {}) {
  const vendorVenueIds = await getVendorVenueIds(vendorId);
  if (!vendorVenueIds.length) {
    throw new AppError("Booking not found", 404);
  }

  const ref = String(bookingRef || "").trim();
  if (!ref) {
    throw new AppError("Booking id is required", 400);
  }

  const orClause = [{ orderNumber: ref }];
  if (mongoose.Types.ObjectId.isValid(ref)) {
    orClause.push({ _id: ref });
  }

  let orderQuery = VenueOrder.findOne({
    "items.venue": { $in: vendorVenueIds },
    $or: orClause,
  });

  if (populate) {
    orderQuery = orderQuery
      .populate("user", "name phone email")
      .populate({
        path: "items.venue",
        select: "name address city state pincode category subCategory capacity",
        populate: [
          { path: "category", select: "name" },
          { path: "subCategory", select: "name" },
        ],
      });
  }

  const order = await orderQuery.lean();
  if (!order) {
    throw new AppError("Booking not found", 404);
  }

  return { order, vendorVenueIds };
}

function toVendorBookingDetail(order, vendorVenueIds, baseUrl, transaction) {
  const item = getPrimaryItemForVendor(order, vendorVenueIds);
  const venue = item?.venue && typeof item.venue === "object" ? item.venue : null;
  const snap = toAddressSnapshotFromOrder(order);
  const user = order.user && typeof order.user === "object" ? order.user : null;
  const amounts = computeBookingAmounts(order);
  const paymentSummary = buildBookingPaymentSummary(order);
  const bookingDates = extractBookingDatesFromOrder(order);
  const invoiceMeta = attachVenueBookingInvoice(order, baseUrl);
  const txStatus = transaction?.status ?? null;

  const customerPhone = snap.phone || user?.phone || "—";
  const customerEmail = snap.email || user?.email || "—";
  const customerAddress = snap.address || "—";

  return {
    id: order.orderNumber,
    orderId: String(order._id),
    status: mapOrderStatusToUi(order.orderStatus),
    orderStatus: order.orderStatus,
    venue: {
      name: venue?.name ?? item?.name ?? "Venue",
      category: venue?.category?.name ?? venue?.subCategory?.name ?? "—",
      location: formatVenueLocation(venue),
      address: formatVenueAddress(venue) || "—",
    },
    customer: {
      name: resolveCustomerName(order),
      email: customerEmail,
      phone: customerPhone,
      address: customerAddress,
    },
    booking: {
      date: bookingDates[0] || formatDateOnly(order.placedAt) || "—",
      time: formatBookingTime(item),
      guests: venue?.capacity ? String(venue.capacity) : "—",
      bookedOn: formatDateOnly(order.placedAt ?? order.createdAt) || "—",
      specialRequests: String(order.notes || "").trim() || "—",
    },
    payment: {
      basePrice: amounts.venueFee,
      taxFees: amounts.taxTotal,
      subTotal: paymentSummary.subTotal,
      grandTotal: paymentSummary.grandTotal,
      total: paymentSummary.grandTotal,
      totalAmount: paymentSummary.totalAmount,
      tokenAmountPercentage: paymentSummary.tokenAmountPercentage,
      tokenAmount: paymentSummary.tokenAmount,
      amountPaid: paymentSummary.amountPaid,
      remainingAmount: paymentSummary.remainingAmount,
      amountDueNow: paymentSummary.amountDueNow,
      usesTokenPayment: paymentSummary.usesTokenPayment,
      tokenAmountLabel: paymentSummary.tokenAmountLabel,
      amountPaidLabel: paymentSummary.amountPaidLabel,
      remainingAmountLabel: paymentSummary.remainingAmountLabel,
      amountDueNowLabel: paymentSummary.amountDueNowLabel,
      grandTotalLabel: paymentSummary.grandTotalLabel,
      method: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod ?? "—",
      status: mapPaymentStatusToUi(order.paymentStatus, txStatus),
      statusLabel: formatPaymentStatusLabel(mapPaymentStatusToUi(order.paymentStatus, txStatus)),
      paymentStatusRaw: order.paymentStatus,
      transactionId: transaction?.transactionId || transaction?.gatewayPaymentId || "—",
    },
    paymentSummary,
    invoice: invoiceMeta.invoice,
    cancellationReason: order.cancellationReason ?? "",
    cancelledAt: order.cancelledAt ?? null,
  };
}

async function attachTransactionId(detail, orderId) {
  const tx = await VenueTransaction.findOne({ order: orderId, type: "payment" })
    .sort({ createdAt: -1 })
    .select("transactionId gatewayPaymentId status")
    .lean();

  if (tx?.transactionId) {
    detail.payment.transactionId = tx.transactionId;
  } else if (tx?.gatewayPaymentId) {
    detail.payment.transactionId = tx.gatewayPaymentId;
  }

  if (tx?.status) {
    detail.payment.status = mapPaymentStatusToUi(detail.payment.paymentStatusRaw, tx.status);
  }
}

async function listVenueVendorBookings(vendorId, options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const skip = (page - 1) * limit;

  const vendorVenueIds = await getVendorVenueIds(vendorId);
  if (!vendorVenueIds.length) {
    return { bookings: [], page, limit, total: 0, pages: 1 };
  }

  const filter = buildVendorOrdersFilter(vendorVenueIds, {
    status: options.status,
    search: options.search,
  });

  const [orders, total] = await Promise.all([
    VenueOrder.find(filter)
      .populate("user", "name phone email")
      .populate("items.venue", "name address city")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueOrder.countDocuments(filter),
  ]);

  const orderIds = orders.map((order) => order._id);
  const transactions = orderIds.length
    ? await VenueTransaction.find({ order: { $in: orderIds }, type: "payment" })
        .select("order status")
        .lean()
    : [];
  const txByOrder = new Map(transactions.map((tx) => [String(tx.order), tx]));

  return {
    bookings: orders.map((order) =>
      toVendorBookingListRow(order, vendorVenueIds, txByOrder.get(String(order._id))?.status)
    ),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit) || 1,
  };
}

async function getVenueVendorBookingDetail(vendorId, bookingRef, baseUrl) {
  const { order, vendorVenueIds } = await loadVendorBookingOrder(vendorId, bookingRef);
  let orderDoc = order;

  const confirmedStatuses = new Set(["confirmed", "processing", "shipped", "delivered"]);
  const paymentMethod = String(order.paymentMethod || "").toLowerCase();
  if (
    confirmedStatuses.has(String(order.orderStatus || "").toLowerCase()) &&
    String(order.paymentStatus || "").toLowerCase() === "pending" &&
    (paymentMethod === "online" || paymentMethod === "wallet")
  ) {
    await markVenueOrderPaymentPaid(order._id);
    orderDoc = await VenueOrder.findById(order._id)
      .populate("user", "name phone email")
      .populate({
        path: "items.venue",
        select: "name address city state pincode category subCategory capacity",
        populate: [
          { path: "category", select: "name" },
          { path: "subCategory", select: "name" },
        ],
      })
      .lean();
  }

  const tx = await VenueTransaction.findOne({ order: orderDoc._id, type: "payment" })
    .sort({ createdAt: -1 })
    .select("transactionId gatewayPaymentId status")
    .lean();
  const detail = toVendorBookingDetail(orderDoc, vendorVenueIds, baseUrl, tx);
  await attachTransactionId(detail, orderDoc._id);
  return detail;
}

async function updateVenueVendorBookingStatus(vendorId, bookingRef, nextStatus) {
  const normalized = String(nextStatus || "").trim().toLowerCase();
  if (!VENDOR_ALLOWED_ORDER_STATUSES.has(normalized)) {
    throw new AppError("Invalid booking status", 400);
  }

  const { order } = await loadVendorBookingOrder(vendorId, bookingRef, { populate: false });
  const doc = await VenueOrder.findById(order._id);
  if (!doc) {
    throw new AppError("Booking not found", 404);
  }

  doc.orderStatus = normalized;
  if (normalized === "cancelled" && !doc.cancelledAt) {
    doc.cancelledAt = new Date();
  }

  const confirmedStatuses = new Set(["confirmed", "processing"]);
  const paymentMethod = String(doc.paymentMethod || "").toLowerCase();
  if (
    confirmedStatuses.has(normalized) &&
    String(doc.paymentStatus || "").toLowerCase() === "pending" &&
    (paymentMethod === "online" || paymentMethod === "wallet")
  ) {
    await doc.save();
    await markVenueOrderPaymentPaid(doc);
    return (await VenueOrder.findById(doc._id).lean()) ?? doc.toObject();
  }

  await doc.save();

  return doc.toObject();
}

async function getVenueVendorBookingInvoice(vendorId, bookingRef, baseUrl) {
  const { order } = await loadVendorBookingOrder(vendorId, bookingRef, { populate: false });
  const result = await ensureVenueBookingInvoicePdf(order._id, baseUrl);
  return {
    ...result.invoiceData,
    ...result.invoice,
  };
}

function emptyDashboardStats() {
  return {
    total: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
  };
}

function emptyDashboardTrends() {
  return {
    total: { label: "0%", trendUp: true },
    pending: { label: "0%", trendUp: true },
    completed: { label: "0%", trendUp: true },
    cancelled: { label: "0%", trendUp: true },
  };
}

function startOfUtcDaysAgo(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function formatTrendLabel(current, previous) {
  if (previous === 0) {
    if (current === 0) return { label: "0%", trendUp: true };
    return { label: "+100%", trendUp: true };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    label: `${pct >= 0 ? "+" : ""}${pct}%`,
    trendUp: pct >= 0,
  };
}

async function countVendorBookings(vendorVenueIds, { orderStatus, createdAt } = {}) {
  const filter = { "items.venue": { $in: vendorVenueIds } };
  if (orderStatus) filter.orderStatus = orderStatus;
  if (createdAt) filter.createdAt = createdAt;
  return VenueOrder.countDocuments(filter);
}

async function computeVenueVendorBookingTrends(vendorVenueIds) {
  const now = new Date();
  const currentFrom = startOfUtcDaysAgo(30);
  const previousFrom = startOfUtcDaysAgo(60);
  const currentRange = { $gte: currentFrom, $lte: now };
  const previousRange = { $gte: previousFrom, $lt: currentFrom };

  const [
    totalCurrent,
    totalPrevious,
    pendingCurrent,
    pendingPrevious,
    completedCurrent,
    completedPrevious,
    cancelledCurrent,
    cancelledPrevious,
  ] = await Promise.all([
    countVendorBookings(vendorVenueIds, { createdAt: currentRange }),
    countVendorBookings(vendorVenueIds, { createdAt: previousRange }),
    countVendorBookings(vendorVenueIds, { orderStatus: "pending", createdAt: currentRange }),
    countVendorBookings(vendorVenueIds, { orderStatus: "pending", createdAt: previousRange }),
    countVendorBookings(vendorVenueIds, {
      orderStatus: { $in: ["confirmed", "processing", "shipped", "delivered"] },
      createdAt: currentRange,
    }),
    countVendorBookings(vendorVenueIds, {
      orderStatus: { $in: ["confirmed", "processing", "shipped", "delivered"] },
      createdAt: previousRange,
    }),
    countVendorBookings(vendorVenueIds, {
      orderStatus: { $in: ["cancelled", "refunded"] },
      createdAt: currentRange,
    }),
    countVendorBookings(vendorVenueIds, {
      orderStatus: { $in: ["cancelled", "refunded"] },
      createdAt: previousRange,
    }),
  ]);

  return {
    total: formatTrendLabel(totalCurrent, totalPrevious),
    pending: formatTrendLabel(pendingCurrent, pendingPrevious),
    completed: formatTrendLabel(completedCurrent, completedPrevious),
    cancelled: formatTrendLabel(cancelledCurrent, cancelledPrevious),
  };
}

async function getVenueVendorDashboard(vendorId, { recentLimit = 5 } = {}) {
  const vendorVenueIds = await getVendorVenueIds(vendorId);
  if (!vendorVenueIds.length) {
    return {
      stats: emptyDashboardStats(),
      trends: emptyDashboardTrends(),
      recentBookings: [],
    };
  }

  const baseFilter = { "items.venue": { $in: vendorVenueIds } };
  const limit = Math.min(20, Math.max(1, Number(recentLimit) || 5));

  const [total, pending, completed, cancelled, trends, recentOrders] = await Promise.all([
    VenueOrder.countDocuments(baseFilter),
    VenueOrder.countDocuments({ ...baseFilter, orderStatus: "pending" }),
    VenueOrder.countDocuments({
      ...baseFilter,
      orderStatus: { $in: ["confirmed", "processing", "shipped", "delivered"] },
    }),
    VenueOrder.countDocuments({
      ...baseFilter,
      orderStatus: { $in: ["cancelled", "refunded"] },
    }),
    computeVenueVendorBookingTrends(vendorVenueIds),
    VenueOrder.find(baseFilter)
      .populate("user", "name phone email")
      .populate("items.venue", "name address city")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  const recentOrderIds = recentOrders.map((order) => order._id);
  const recentTransactions = recentOrderIds.length
    ? await VenueTransaction.find({ order: { $in: recentOrderIds }, type: "payment" })
        .select("order status")
        .lean()
    : [];
  const recentTxByOrder = new Map(recentTransactions.map((tx) => [String(tx.order), tx]));

  return {
    stats: {
      total,
      pending,
      completed,
      cancelled,
    },
    trends,
    recentBookings: recentOrders.map((order) =>
      toVendorBookingListRow(
        order,
        vendorVenueIds,
        recentTxByOrder.get(String(order._id))?.status
      )
    ),
  };
}

module.exports = {
  listVenueVendorBookings,
  getVenueVendorBookingDetail,
  updateVenueVendorBookingStatus,
  getVenueVendorBookingInvoice,
  getVenueVendorDashboard,
  mapOrderStatusToUi,
  mapPaymentStatusToUi,
};
