const { formatDateOnly, parseDateOnly } = require("./dateOnly");
const { buildBookingPaymentSummary } = require("./venueBooking");

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

const STATUS_LABELS = {
  upcoming: "Upcoming",
  canceled: "Canceled",
  completed: "Completed",
};

function extractBookingDatesFromOrder(order) {
  const dates = (order.items ?? [])
    .map((item) => formatDateOnly(item.bookingDate))
    .filter(Boolean);
  return [...new Set(dates)].sort();
}

function formatDisplayDate(dateStr) {
  const d = parseDateOnly(dateStr);
  if (!d) return dateStr;
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatBookingRangeLabel(bookingDates) {
  if (!bookingDates.length) return "";
  if (bookingDates.length === 1) return formatDisplayDate(bookingDates[0]);

  const first = parseDateOnly(bookingDates[0]);
  const last = parseDateOnly(bookingDates[bookingDates.length - 1]);
  if (!first || !last) return formatBookingDateLabelFallback(bookingDates);

  if (
    first.getUTCMonth() === last.getUTCMonth() &&
    first.getUTCFullYear() === last.getUTCFullYear()
  ) {
    return `${MONTH_SHORT[first.getUTCMonth()]} ${first.getUTCDate()}-${last.getUTCDate()}, ${first.getUTCFullYear()}`;
  }

  return `${formatDisplayDate(bookingDates[0])} - ${formatDisplayDate(bookingDates[bookingDates.length - 1])}`;
}

function formatBookingDateLabelFallback(dates) {
  if (dates.length === 1) return dates[0];
  return `${dates[0]} – ${dates[dates.length - 1]}`;
}

function resolveBookingStatus(order, bookingDates) {
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  if (orderStatus === "cancelled" || orderStatus === "refunded") {
    return "canceled";
  }

  const today = formatDateOnly(new Date());
  const lastDate = bookingDates[bookingDates.length - 1];
  if (lastDate && lastDate < today) {
    return "completed";
  }

  if (orderStatus === "delivered") {
    return "completed";
  }

  return "upcoming";
}

function formatGroupDateLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatInrAmount(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

function getPrimaryVenueFromOrder(order) {
  const item = (order.items ?? []).find((i) => i.venue && typeof i.venue === "object");
  return item?.venue ?? null;
}

function toAddressSnapshotFromOrder(order) {
  const snap = order.addressSnapshot && typeof order.addressSnapshot === "object"
    ? order.addressSnapshot
    : {};

  return {
    name: String(snap.name ?? "").trim(),
    phone: String(snap.phone ?? "").trim(),
    email: String(snap.email ?? "").trim(),
    address: String(snap.address ?? "").trim(),
    countryCode: String(snap.countryCode ?? "+91").trim() || "+91",
  };
}

function toBookingHistoryCard(order, baseUrl, toAbsoluteUploadUrl) {
  const bookingDates = extractBookingDatesFromOrder(order);
  const venue = getPrimaryVenueFromOrder(order);
  const status = resolveBookingStatus(order, bookingDates);
  const firstItem = order.items?.[0];
  const payment = buildBookingPaymentSummary(order);

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    venueId: venue?._id ?? firstItem?.venue ?? null,
    venueName: venue?.name ?? firstItem?.name ?? "Venue",
    venueImage: venue?.thumbnail ? toAbsoluteUploadUrl(venue.thumbnail, baseUrl) : "",
    bookingType: firstItem?.bookingType ?? "full_day",
    bookingStartDate: bookingDates[0] ?? null,
    bookingEndDate: bookingDates[bookingDates.length - 1] ?? null,
    bookingDates,
    dateRangeLabel: formatBookingRangeLabel(bookingDates),
    bookingSlot: firstItem?.bookingSlot ?? "",
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
    orderStatus: order.orderStatus,
    paymentStatus: payment.paymentStatus,
    paymentMethod: payment.paymentMethod,
    subTotal: payment.subTotal,
    discountTotal: payment.discountTotal,
    taxTotal: payment.taxTotal,
    grandTotal: payment.grandTotal,
    totalAmount: payment.totalAmount,
    tokenAmountPercentage: payment.tokenAmountPercentage,
    tokenAmount: payment.tokenAmount,
    amountPaid: payment.amountPaid,
    remainingAmount: payment.remainingAmount,
    amountDueNow: payment.amountDueNow,
    usesTokenPayment: payment.usesTokenPayment,
    currency: payment.currency,
    symbol: payment.symbol,
    subTotalLabel: payment.subTotalLabel,
    grandTotalLabel: payment.grandTotalLabel,
    totalAmountLabel: payment.totalAmountLabel,
    tokenAmountLabel: payment.tokenAmountLabel,
    amountPaidLabel: payment.amountPaidLabel,
    remainingAmountLabel: payment.remainingAmountLabel,
    amountDueNowLabel: payment.amountDueNowLabel,
    payment,
    placedAt: order.placedAt ?? order.createdAt,
    createdAt: order.createdAt,
    groupDate: formatDateOnly(order.createdAt),
    groupDateLabel: formatGroupDateLabel(order.createdAt),
    addressSnapshot: toAddressSnapshotFromOrder(order),
    cancellationReason: order.cancellationReason ?? "",
    cancelledAt: order.cancelledAt ?? null,
  };
}

function toBookingDetailPayload(order, baseUrl, toAbsoluteUploadUrl) {
  const { addressSnapshot, payment, ...booking } = toBookingHistoryCard(order, baseUrl, toAbsoluteUploadUrl);

  return {
    ...booking,
    payment,
    paymentSummary: payment,
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      items: order.items,
      subTotal: payment.subTotal,
      discountTotal: payment.discountTotal,
      taxTotal: payment.taxTotal,
      grandTotal: payment.grandTotal,
      totalAmount: payment.totalAmount,
      tokenAmountPercentage: payment.tokenAmountPercentage,
      tokenAmount: payment.tokenAmount,
      amountPaid: payment.amountPaid,
      remainingAmount: payment.remainingAmount,
      amountDueNow: payment.amountDueNow,
      usesTokenPayment: payment.usesTokenPayment,
      paymentMethod: payment.paymentMethod,
      paymentStatus: payment.paymentStatus,
      orderStatus: order.orderStatus,
      notes: order.notes ?? "",
      cancellationReason: order.cancellationReason ?? "",
      cancelledAt: order.cancelledAt ?? null,
      addressSnapshot,
      placedAt: order.placedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      payment,
    },
    cancellationReason: order.cancellationReason ?? "",
    cancelledAt: order.cancelledAt ?? null,
  };
}

function sortBookingsByNewest(bookings) {
  return bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function paginateBookings(bookings, page, limit) {
  const sorted = sortBookingsByNewest([...bookings]);
  const total = sorted.length;
  const start = (page - 1) * limit;
  return {
    bookings: sorted.slice(start, start + limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}

function buildBookingHistoryList(orders, baseUrl, toAbsoluteUploadUrl, { status: statusFilter } = {}) {
  let bookings = orders.map((order) =>
    toBookingHistoryCard(order, baseUrl, toAbsoluteUploadUrl)
  );

  if (statusFilter) {
    const normalized = String(statusFilter).trim().toLowerCase();
    bookings = bookings.filter((b) => b.status === normalized);
  }

  return bookings;
}

module.exports = {
  buildBookingHistoryList,
  paginateBookings,
  toBookingHistoryCard,
  toBookingDetailPayload,
  toAddressSnapshotFromOrder,
  extractBookingDatesFromOrder,
  resolveBookingStatus,
  formatBookingRangeLabel,
};
