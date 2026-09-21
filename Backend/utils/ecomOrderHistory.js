const mongoose = require("mongoose");
const Order = require("../models/other/order");
const Product = require("../models/other/product");
const { formatInrAmount } = require("./publicProductList");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { formatDateOnly } = require("./dateOnly");

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

const STATUS_DISPLAY = {
  pending: { key: "processing", label: "Processing", tone: "purple" },
  confirmed: { key: "processing", label: "Processing", tone: "purple" },
  processing: { key: "processing", label: "Processing", tone: "purple" },
  shipped: { key: "out_for_delivery", label: "Out For Delivery", tone: "orange" },
  delivered: { key: "delivered", label: "Delivered", tone: "green" },
  cancelled: { key: "cancelled", label: "Cancelled", tone: "red" },
  refunded: { key: "refunded", label: "Refunded", tone: "grey" },
};

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function formatOrderDisplayId(order) {
  const raw = String(order._id || "");
  return `OID${raw.slice(-4).toUpperCase()}`;
}

function formatGroupDateLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function resolveOrderHistoryStatus(order) {
  const orderStatus = String(order.orderStatus || "pending").toLowerCase();
  return (
    STATUS_DISPLAY[orderStatus] ?? {
      key: orderStatus,
      label: orderStatus,
      tone: "grey",
    }
  );
}

function formatProductTitle(order) {
  const items = order.items ?? [];
  if (!items.length) return "";

  const firstName = items[0].name || "Product";
  if (items.length === 1) return firstName;

  return `${firstName} +${items.length - 1} more`;
}

function toOrderHistoryCard(order, productMap, baseUrl) {
  const primaryItem = order.items?.[0] ?? null;
  const product = primaryItem ? productMap.get(String(primaryItem.product)) : null;
  const status = resolveOrderHistoryStatus(order);
  const placedAt = order.placedAt ?? order.createdAt;
  const subTotal = Number(order.subTotal) || 0;
  const shippingCharge = Number(order.shippingCharge) || 0;
  const grandTotal = Number(order.grandTotal) || subTotal + shippingCharge;

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderDisplayId: formatOrderDisplayId(order),
    productId: primaryItem?.product ?? null,
    productName: formatProductTitle(order),
    thumbnail: product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, baseUrl) : "",
    itemCount: order.items?.length ?? 0,
    status: status.key,
    statusLabel: status.label,
    statusTone: status.tone,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    subTotal,
    subTotalLabel: formatInrAmount(subTotal),
    shippingCharge,
    shippingChargeLabel: formatInrAmount(shippingCharge),
    shippingCost: shippingCharge,
    shippingCostLabel: formatInrAmount(shippingCharge),
    deliveryCharge: shippingCharge,
    deliveryChargeLabel: formatInrAmount(shippingCharge),
    totalAmount: grandTotal,
    totalAmountLabel: formatInrAmount(grandTotal),
    grandTotal,
    grandTotalLabel: formatInrAmount(grandTotal),
    summary: {
      subTotal,
      subTotalLabel: formatInrAmount(subTotal),
      shippingCharge,
      shippingChargeLabel: formatInrAmount(shippingCharge),
      deliveryCharge: shippingCharge,
      deliveryChargeLabel: formatInrAmount(shippingCharge),
      grandTotal,
      grandTotalLabel: formatInrAmount(grandTotal),
      totalAmount: grandTotal,
      totalAmountLabel: formatInrAmount(grandTotal),
    },
    currency: "INR",
    symbol: "₹",
    placedAt,
    groupDate: formatDateOnly(placedAt),
    groupDateLabel: formatGroupDateLabel(placedAt),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function hydrateProductThumbnails(orders) {
  const productIds = [
    ...new Set(
      orders
        .flatMap((order) => (order.items ?? []).map((item) => String(item.product)))
        .filter(Boolean)
    ),
  ];

  if (!productIds.length) return new Map();

  const products = await Product.find({
    _id: { $in: productIds.map((id) => toObjectId(id)) },
  })
    .select("thumbnail")
    .lean();

  return new Map(products.map((product) => [String(product._id), product]));
}

function buildOrderHistoryList(orders, productMap, baseUrl, { status: statusFilter } = {}) {
  let rows = orders.map((order) => toOrderHistoryCard(order, productMap, baseUrl));

  if (statusFilter) {
    const normalized = String(statusFilter).trim().toLowerCase();
    rows = rows.filter((row) => row.status === normalized);
  }

  return rows.sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));
}

function paginateOrderHistory(rows, page, limit) {
  const sorted = [...rows].sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));
  const total = sorted.length;
  const start = (page - 1) * limit;

  return {
    orders: sorted.slice(start, start + limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}

function applyGroupDateRangeFilter(rows, dateRange) {
  if (!dateRange?.startDate && !dateRange?.endDate) return rows;

  const start = dateRange.startDate || "0000-01-01";
  const end = dateRange.endDate || "9999-12-31";

  return rows.filter((row) => {
    const groupDate = row.groupDate;
    if (!groupDate) return false;
    return groupDate >= start && groupDate <= end;
  });
}

function buildOrderHistoryDateFilter(dateRange) {
  if (!dateRange?.mongoRange) return null;

  const clauses = [];
  if (dateRange.mongoRange.$gte) {
    clauses.push({
      $gte: [{ $ifNull: ["$placedAt", "$createdAt"] }, dateRange.mongoRange.$gte],
    });
  }
  if (dateRange.mongoRange.$lte) {
    clauses.push({
      $lte: [{ $ifNull: ["$placedAt", "$createdAt"] }, dateRange.mongoRange.$lte],
    });
  }

  return clauses.length ? { $expr: { $and: clauses } } : null;
}

async function listUserOrderHistory(userId, options = {}) {
  const { status = null, dateRange = null, page = 1, limit = 20, baseUrl = "" } = options;

  const filter = { user: toObjectId(userId) };
  const dateFilter = buildOrderHistoryDateFilter(dateRange);
  if (dateFilter) {
    Object.assign(filter, dateFilter);
  }

  const orders = await Order.find(filter).sort({ placedAt: -1, createdAt: -1 }).lean();
  const productMap = await hydrateProductThumbnails(orders);
  let allRows = buildOrderHistoryList(orders, productMap, baseUrl, { status });
  allRows = applyGroupDateRangeFilter(allRows, dateRange);

  return paginateOrderHistory(allRows, page, limit);
}

module.exports = {
  toOrderHistoryCard,
  buildOrderHistoryList,
  paginateOrderHistory,
  listUserOrderHistory,
  resolveOrderHistoryStatus,
  formatGroupDateLabel,
};
