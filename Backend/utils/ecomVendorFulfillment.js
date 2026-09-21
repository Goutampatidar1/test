const mongoose = require("mongoose");
const Product = require("../models/other/product");

const VENDOR_FULFILLMENT_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function resolveItemVendorId(item, productMap) {
  if (item?.vendor) return String(item.vendor);
  const product = productMap.get(String(item.product));
  if (product?.role === "Vendor" && product.addedById) {
    return String(product.addedById);
  }
  return null;
}

async function loadProductMapForItems(items = []) {
  const productIds = [
    ...new Set(items.map((item) => String(item.product)).filter(Boolean)),
  ];
  if (!productIds.length) return new Map();

  const products = await Product.find({
    _id: { $in: productIds.map((id) => toObjectId(id)) },
  })
    .select("addedById role")
    .lean();

  return new Map(products.map((product) => [String(product._id), product]));
}

async function buildVendorFulfillmentsFromItems(items = [], { orderStatus = "pending", deliveryBoy = null } = {}) {
  const productMap = await loadProductMapForItems(items);
  const vendorIds = new Set();

  for (const item of items) {
    const vendorId = resolveItemVendorId(item, productMap);
    if (vendorId) vendorIds.add(vendorId);
  }

  const normalizedOrderStatus = String(orderStatus || "pending").toLowerCase();
  const legacyStatus =
    normalizedOrderStatus === "pending"
      ? "pending"
      : ["cancelled", "refunded"].includes(normalizedOrderStatus)
        ? "cancelled"
        : normalizedOrderStatus;

  return [...vendorIds].map((vendorId) => ({
    vendor: toObjectId(vendorId),
    status: legacyStatus,
    deliveryBoy: deliveryBoy ? toObjectId(deliveryBoy) : null,
    acceptedAt: null,
    rejectedAt: null,
    cancellationReason: "",
    shippedAt: null,
    deliveredAt: null,
  }));
}

function getVendorFulfillment(order, vendorId) {
  const vid = String(vendorId);
  return (order?.vendorFulfillments ?? []).find((row) => String(row.vendor) === vid) || null;
}

function resolveVendorFulfillmentStatus(order, vendorId) {
  const fulfillment = getVendorFulfillment(order, vendorId);
  if (fulfillment?.status) {
    return String(fulfillment.status).toLowerCase();
  }
  return String(order?.orderStatus || "pending").toLowerCase();
}

function syncAggregateOrderStatus(fulfillments = []) {
  if (!fulfillments.length) return "pending";

  const statuses = fulfillments.map((row) => String(row.status || "pending").toLowerCase());

  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.some((status) => status === "cancelled")) return "cancelled";
  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.every((status) => status === "shipped" || status === "delivered")) {
    return statuses.some((status) => status === "shipped") ? "shipped" : "delivered";
  }
  if (statuses.every((status) => ["confirmed", "processing", "shipped", "delivered"].includes(status))) {
    if (statuses.some((status) => status === "processing")) return "processing";
    return "confirmed";
  }
  if (statuses.every((status) => status === "pending")) return "pending";
  if (statuses.some((status) => ["confirmed", "processing", "shipped", "delivered"].includes(status))) {
    return "processing";
  }

  return "pending";
}

async function ensureVendorFulfillmentsPersisted(orderDoc) {
  if (orderDoc.vendorFulfillments?.length) {
    return orderDoc.vendorFulfillments;
  }

  orderDoc.vendorFulfillments = await buildVendorFulfillmentsFromItems(orderDoc.items ?? [], {
    orderStatus: orderDoc.orderStatus,
    deliveryBoy: orderDoc.deliveryBoy,
  });
  await orderDoc.save();
  return orderDoc.vendorFulfillments;
}

function vendorFulfillmentMatchesTab(order, vendorId, statuses) {
  if (!statuses?.length) return true;
  const vendorStatus = resolveVendorFulfillmentStatus(order, vendorId);
  return statuses.includes(vendorStatus);
}

module.exports = {
  VENDOR_FULFILLMENT_STATUSES,
  buildVendorFulfillmentsFromItems,
  getVendorFulfillment,
  resolveVendorFulfillmentStatus,
  syncAggregateOrderStatus,
  ensureVendorFulfillmentsPersisted,
  vendorFulfillmentMatchesTab,
  resolveItemVendorId,
  loadProductMapForItems,
};
