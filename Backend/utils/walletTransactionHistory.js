const WalletTransaction = require("../models/other/walletTransaction");
const Transaction = require("../models/other/transaction");
const Order = require("../models/other/order");
const { parseDateRangeFromQuery } = require("./dateOnly");
const { isCodPaymentMethod } = require("./userWallet");
const {
  formatInrAmount,
  formatTransactionDateTime,
  STATUS_LABELS,
} = require("./transactionHistory");

const WALLET_DIRECTION_LABELS = {
  credit: "Credit",
  debit: "Debit",
};

function normalizeWalletDirection(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "credit" || key === "cr" || key === "in") return "credit";
  if (key === "debit" || key === "dr" || key === "out") return "debit";
  return null;
}

function buildWalletHistoryItem({
  _id,
  transactionId,
  title,
  type,
  direction,
  amount,
  currency = "INR",
  status,
  source,
  referenceId = null,
  referenceNumber = "",
  remarks = "",
  displayDate,
  createdAt,
}) {
  const normalizedStatus = String(status || "pending").toLowerCase();
  const value = Number(amount) || 0;
  const signedPrefix = direction === "debit" ? "-" : "+";

  return {
    _id,
    transactionId,
    transactionIdLabel: `#${transactionId}`,
    title,
    type,
    direction,
    directionLabel: WALLET_DIRECTION_LABELS[direction] || direction,
    amount: value,
    currency,
    symbol: "₹",
    amountLabel: formatInrAmount(value),
    signedAmount: direction === "debit" ? -value : value,
    signedAmountLabel: `${signedPrefix}${formatInrAmount(value)}`,
    status: normalizedStatus,
    statusLabel: STATUS_LABELS[normalizedStatus] ?? normalizedStatus.toUpperCase(),
    source,
    referenceId,
    referenceNumber,
    remarks,
    dateTime: displayDate,
    dateTimeLabel: formatTransactionDateTime(displayDate),
    createdAt,
  };
}

function toWalletTopUpItem(tx) {
  return buildWalletHistoryItem({
    _id: tx._id,
    transactionId: tx.transactionId,
    title: "Wallet Top-up",
    type: "topup",
    direction: "credit",
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    source: "wallet_topup",
    remarks: tx.remarks || "Wallet top-up",
    displayDate: tx.processedAt ?? tx.createdAt,
    createdAt: tx.createdAt,
  });
}

function toWalletRefundItem(tx, order) {
  return buildWalletHistoryItem({
    _id: tx._id,
    transactionId: tx.transactionId,
    title: "Refund to Wallet",
    type: "refund",
    direction: "credit",
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    source: "order_refund",
    referenceId: order?._id ?? tx.order,
    referenceNumber: order?.orderNumber ?? "",
    remarks: tx.remarks || "Order refund credited to wallet",
    displayDate: tx.processedAt ?? tx.createdAt,
    createdAt: tx.createdAt,
  });
}

function toWalletPaymentFromWalletTx(tx, order) {
  return buildWalletHistoryItem({
    _id: tx._id,
    transactionId: tx.transactionId,
    title: "Order Payment",
    type: "payment",
    direction: "debit",
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    source: "wallet_payment",
    referenceId: order?._id ?? tx.order,
    referenceNumber: order?.orderNumber ?? "",
    remarks: tx.remarks || "Paid using wallet",
    displayDate: tx.processedAt ?? tx.createdAt,
    createdAt: tx.createdAt,
  });
}

function sortWalletTransactions(items, sort = "desc") {
  const key = String(sort || "desc").trim().toLowerCase();
  const ascending =
    key === "asc" ||
    key === "oldest" ||
    key === "date_asc" ||
    key === "old" ||
    key === "oldest_first";

  return [...items].sort((a, b) => {
    const aTime = new Date(a.dateTime || a.createdAt).getTime();
    const bTime = new Date(b.dateTime || b.createdAt).getTime();
    return ascending ? aTime - bTime : bTime - aTime;
  });
}

function paginateWalletTransactions(items, page, limit, sort = "desc") {
  const sorted = sortWalletTransactions(items, sort);
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

function filterWalletTransactions(items, { direction, status, type } = {}) {
  let rows = items;

  const directionFilter = normalizeWalletDirection(direction);
  if (directionFilter) {
    rows = rows.filter((row) => row.direction === directionFilter);
  }

  if (status) {
    const statusKey = String(status).trim().toLowerCase();
    rows = rows.filter((row) => row.status === statusKey);
  }

  if (type) {
    const typeKey = String(type).trim().toLowerCase();
    rows = rows.filter((row) => row.type === typeKey);
  }

  return rows;
}

function normalizeWalletSearch(value) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesWalletSearch(item, search) {
  const term = normalizeWalletSearch(search);
  if (!term) return true;

  const haystack = [
    item.title,
    item.remarks,
    item.transactionId,
    item.referenceNumber,
    item.type,
    item.directionLabel,
    item.statusLabel,
  ]
    .map((part) => String(part ?? "").toLowerCase())
    .join(" ");

  return haystack.includes(term);
}

function filterWalletTransactionsByDate(items, dateRange) {
  if (!dateRange?.mongoRange) return items;

  const { $gte: start, $lte: end } = dateRange.mongoRange;
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;

  return items.filter((item) => {
    const when = new Date(item.dateTime || item.createdAt).getTime();
    if (Number.isNaN(when)) return false;
    if (startMs != null && when < startMs) return false;
    if (endMs != null && when > endMs) return false;
    return true;
  });
}

function searchWalletTransactions(items, search) {
  const term = normalizeWalletSearch(search);
  if (!term) return items;
  return items.filter((item) => matchesWalletSearch(item, term));
}

async function listUserWalletTransactions(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    direction,
    status,
    type,
    search,
    sort = "desc",
    dateRange,
  } = options;
  const topUpFilter = { user: userId };
  const ecomFilter = { user: userId };

  if (dateRange?.mongoRange) {
    topUpFilter.createdAt = dateRange.mongoRange;
    ecomFilter.createdAt = dateRange.mongoRange;
  }

  const [topUps, walletPayments, walletRefunds] = await Promise.all([
    WalletTransaction.find({ ...topUpFilter, type: "topup" })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    WalletTransaction.find({ ...topUpFilter, type: "payment" })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    Transaction.find({
      ...ecomFilter,
      type: "refund",
      status: "success",
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
  ]);

  const orderIds = [
    ...new Set(
      [...walletPayments, ...walletRefunds]
        .map((tx) => String(tx.order))
        .filter(Boolean)
    ),
  ];

  const orders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds } })
        .select("_id orderNumber paymentMethod paymentStatus")
        .lean()
    : [];
  const orderMap = new Map(orders.map((order) => [String(order._id), order]));

  const visibleRefunds = walletRefunds.filter((tx) => {
    const order = orderMap.get(String(tx.order));
    if (!order) return true;
    return !isCodPaymentMethod(order.paymentMethod);
  });

  let items = [
    ...topUps.map(toWalletTopUpItem),
    ...visibleRefunds.map((tx) =>
      toWalletRefundItem(tx, orderMap.get(String(tx.order)))
    ),
    ...walletPayments.map((tx) =>
      toWalletPaymentFromWalletTx(tx, orderMap.get(String(tx.order)))
    ),
  ];

  items = filterWalletTransactions(items, { direction, status, type });
  items = searchWalletTransactions(items, search);
  items = filterWalletTransactionsByDate(items, dateRange);
  return paginateWalletTransactions(items, page, limit, sort);
}

module.exports = {
  listUserWalletTransactions,
  toWalletTopUpItem,
  toWalletRefundItem,
  toWalletPaymentFromWalletTx,
};
