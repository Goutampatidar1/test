const {
  extractBookingDatesFromOrder,
  formatBookingRangeLabel,
} = require("./venueBookingHistory");
const { formatDateTimeLabel } = require("./dateOnly");

const STATUS_LABELS = {
  initiated: "PENDING",
  pending: "PENDING",
  success: "SUCCESS",
  failed: "FAILED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
};

const PAYMENT_METHOD_LABELS = {
  cod: "COD",
  online: "Online Payment",
  wallet: "Wallet",
  upi: "UPI",
  card: "Card",
  netbanking: "Net Banking",
};

const RECHARGE_TITLES = {
  gas: "Gas Cylinder Booking",
  fastag: "FASTag Recharge",
  mobile: "Mobile Recharge",
};

function formatInrAmount(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatTransactionDateTime(value) {
  return formatDateTimeLabel(value);
}

function buildHistoryItem({
  _id,
  transactionId,
  source,
  module,
  title,
  referenceId,
  referenceNumber,
  amount,
  currency,
  status,
  paymentMethod,
  type,
  displayDate,
  createdAt,
}) {
  const normalizedStatus = String(status || "pending").toLowerCase();
  const normalizedMethod = String(paymentMethod || "").toLowerCase();

  return {
    _id,
    transactionId,
    transactionIdLabel: `#${transactionId}`,
    source,
    module,
    title,
    referenceId: referenceId ?? null,
    referenceNumber: referenceNumber ?? "",
    amount: amount ?? 0,
    currency: currency ?? "INR",
    symbol: "₹",
    amountLabel: formatInrAmount(amount),
    status: normalizedStatus,
    statusLabel: STATUS_LABELS[normalizedStatus] ?? normalizedStatus.toUpperCase(),
    paymentMethod: normalizedMethod,
    paymentMethodLabel:
      PAYMENT_METHOD_LABELS[normalizedMethod] ??
      (normalizedMethod ? normalizedMethod.toUpperCase() : ""),
    type: type ?? "payment",
    dateTime: displayDate,
    dateTimeLabel: formatTransactionDateTime(displayDate),
    createdAt,
  };
}

function toVenueTransactionHistoryItem(tx, order) {
  const bookingDates = order ? extractBookingDatesFromOrder(order) : [];

  return {
    ...buildHistoryItem({
      _id: tx._id,
      transactionId: tx.transactionId,
      source: "venue_transaction",
      module: "venue",
      title: "Venue Booking",
      referenceId: order?._id ?? tx.order,
      referenceNumber: order?.orderNumber ?? "",
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      paymentMethod: tx.paymentMethod,
      type: tx.type,
      displayDate: tx.processedAt ?? tx.createdAt,
      createdAt: tx.createdAt,
    }),
    bookingStartDate: bookingDates[0] ?? null,
    bookingEndDate: bookingDates[bookingDates.length - 1] ?? null,
    bookingDates,
    dateRangeLabel: formatBookingRangeLabel(bookingDates),
  };
}

function toEcomTransactionHistoryItem(tx, order) {
  return buildHistoryItem({
    _id: tx._id,
    transactionId: tx.transactionId,
    source: "ecom_transaction",
    module: "ecom",
    title: "Place Order",
    referenceId: order?._id ?? tx.order,
    referenceNumber: order?.orderNumber ?? "",
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    paymentMethod: tx.paymentMethod,
    type: tx.type,
    displayDate: tx.processedAt ?? tx.createdAt,
    createdAt: tx.createdAt,
  });
}

function toRechargeTransactionHistoryItem(tx) {
  const rechargeType = String(tx.rechargeType || "mobile").toLowerCase();

  return buildHistoryItem({
    _id: tx._id,
    transactionId: tx.transactionId,
    source: "recharge_transaction",
    module: rechargeType,
    title: RECHARGE_TITLES[rechargeType] ?? "Recharge",
    referenceId: tx.recharge,
    referenceNumber: tx.referenceId ?? "",
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    paymentMethod: tx.paymentMethod,
    type: tx.type,
    displayDate: tx.processedAt ?? tx.createdAt,
    createdAt: tx.createdAt,
  });
}

function sortByNewest(items) {
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function paginateTransactions(items, page, limit) {
  const sorted = sortByNewest([...items]);
  const total = sorted.length;
  const start = (page - 1) * limit;
  return {
    transactions: sorted.slice(start, start + limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}

function filterByModule(items, moduleFilter) {
  if (!moduleFilter) return items;
  const allowed = new Set(
    String(moduleFilter)
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!allowed.size) return items;
  return items.filter((item) => allowed.has(item.module));
}

module.exports = {
  STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECHARGE_TITLES,
  toVenueTransactionHistoryItem,
  toEcomTransactionHistoryItem,
  toRechargeTransactionHistoryItem,
  paginateTransactions,
  filterByModule,
  formatInrAmount,
  formatTransactionDateTime,
};
