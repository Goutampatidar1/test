const VendorWalletTransaction = require("../models/other/vendorWalletTransaction");
const Order = require("../models/other/order");
const {
  formatInrAmount,
  formatTransactionDateTime,
  STATUS_LABELS,
} = require("./transactionHistory");

const DIRECTION_LABELS = {
  credit: "CREDIT",
  debit: "DEBIT",
};

function normalizeDirection(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "credit" || key === "cr" || key === "in") return "credit";
  if (key === "debit" || key === "dr" || key === "out") return "debit";
  return null;
}

function buildHistoryItem({
  _id,
  transactionId,
  title,
  direction,
  category,
  amount,
  status,
  orderId = null,
  orderNumber = "",
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
    title: title || (direction === "credit" ? "Credit" : "Withdrawal"),
    direction,
    directionLabel: DIRECTION_LABELS[direction] || direction.toUpperCase(),
    category,
    amount: value,
    symbol: "₹",
    amountLabel: formatInrAmount(value),
    signedAmount: direction === "debit" ? -value : value,
    signedAmountLabel: `${signedPrefix}${formatInrAmount(value)}`,
    status: normalizedStatus,
    statusLabel: STATUS_LABELS[normalizedStatus] ?? normalizedStatus.toUpperCase(),
    orderId,
    orderNumber,
    orderIdLabel: orderNumber ? `Order ID - ${orderNumber}` : "",
    remarks,
    dateTime: displayDate,
    dateTimeLabel: formatTransactionDateTime(displayDate),
    createdAt,
  };
}

function buildSearchFilter(search) {
  const term = String(search || "").trim();
  if (!term) return null;

  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return {
    $or: [{ transactionId: regex }, { title: regex }, { remarks: regex }],
  };
}

function buildDateFilter(dateRange) {
  if (!dateRange?.startDate && !dateRange?.endDate) return null;

  const createdAt = {};
  if (dateRange.startDate) {
    createdAt.$gte = new Date(`${dateRange.startDate}T00:00:00.000Z`);
  }
  if (dateRange.endDate) {
    createdAt.$lte = new Date(`${dateRange.endDate}T23:59:59.999Z`);
  }

  return { createdAt };
}

async function listVendorWalletTransactions(vendorId, options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const skip = (page - 1) * limit;
  const sortDir = String(options.sort || "desc").toLowerCase() === "asc" ? 1 : -1;

  const filter = { vendor: vendorId };

  const direction = normalizeDirection(options.direction);
  if (direction) filter.direction = direction;

  if (options.status) {
    filter.status = String(options.status).trim().toLowerCase();
  }

  if (options.category) {
    filter.category = String(options.category).trim().toLowerCase();
  }

  const searchFilter = buildSearchFilter(options.search);
  if (searchFilter) Object.assign(filter, searchFilter);

  const dateFilter = buildDateFilter(options.dateRange);
  if (dateFilter) Object.assign(filter, dateFilter);

  const [rows, total] = await Promise.all([
    VendorWalletTransaction.find(filter)
      .sort({ createdAt: sortDir })
      .skip(skip)
      .limit(limit)
      .lean(),
    VendorWalletTransaction.countDocuments(filter),
  ]);

  const orderIds = rows.map((row) => row.order).filter(Boolean);
  const orders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds } }).select("orderNumber addressSnapshot").lean()
    : [];
  const orderMap = new Map(orders.map((order) => [String(order._id), order]));

  const transactions = rows.map((row) => {
    const order = row.order ? orderMap.get(String(row.order)) : null;
    const customerName =
      row.title ||
      order?.addressSnapshot?.fullName ||
      order?.addressSnapshot?.name ||
      "";

    return buildHistoryItem({
      _id: row._id,
      transactionId: row.transactionId,
      title: customerName,
      direction: row.direction,
      category: row.category,
      amount: row.amount,
      status: row.status,
      orderId: order?._id ?? row.order ?? null,
      orderNumber: order?.orderNumber ?? "",
      remarks: row.remarks,
      displayDate: row.processedAt ?? row.createdAt,
      createdAt: row.createdAt,
    });
  });

  return {
    transactions,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    page,
    limit,
  };
}

module.exports = {
  listVendorWalletTransactions,
};
