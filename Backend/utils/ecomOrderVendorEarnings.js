const mongoose = require("mongoose");
const Product = require("../models/other/product");
const Vendor = require("../models/entity/vendor");
const { AppConfig } = require("../models");
const { creditVendorOrderEarning } = require("./vendorWallet");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumItemTotals(items) {
  return items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
}

/** Merchandise only — must match order.subTotal basis (tax excluded). */
function sumItemMerchandise(items) {
  return money(
    items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const unit = Number(item.unitPrice) || 0;
      return sum + unit * qty;
    }, 0)
  );
}

function computeVendorShippingShare(order, vendorMerchandiseTotal) {
  const orderShipping = money(order.shippingCharge);
  const orderSub = money(order.subTotal);
  const vendorMerch = money(vendorMerchandiseTotal);
  if (orderShipping <= 0 || orderSub <= 0 || vendorMerch <= 0) return 0;
  if (Math.abs(vendorMerch - orderSub) <= 0.05) return orderShipping;
  const ratio = Math.min(1, vendorMerch / orderSub);
  return money(orderShipping * ratio);
}

async function getVendorProductIdSet(vendorId) {
  const products = await Product.find({
    addedById: toObjectId(vendorId),
    role: { $ne: "VenueVendor" },
  })
    .select("_id")
    .lean();

  return new Set(products.map((product) => String(product._id)));
}

function itemBelongsToVendor(item, vendorId, productIdSet) {
  const vid = String(vendorId);
  if (item?.vendor && String(item.vendor) === vid) return true;
  return productIdSet.has(String(item.product));
}

function filterVendorItems(order, productIdSet, vendorId) {
  return (order.items ?? []).filter((item) => itemBelongsToVendor(item, vendorId, productIdSet));
}

async function getVendorCommissionPercent() {
  const config = await AppConfig.findOne().select("commissions").lean();
  const row = (config?.commissions ?? []).find((entry) => entry.type === "Vendor");
  return Number(row?.percentage) || 0;
}

function buildVendorEarningsAmount(order, vendorItems, commissionPercent) {
  const merchandise = sumItemMerchandise(vendorItems);
  const taxAmount = money(sumItemTotals(vendorItems) - merchandise);
  const shippingCost = computeVendorShippingShare(order, merchandise);
  const grossTotal = money(merchandise + Math.max(0, taxAmount) + shippingCost);
  const commissionAmount = money((merchandise * (Number(commissionPercent) || 0)) / 100);
  return money(Math.max(0, grossTotal - commissionAmount));
}

function isVendorOrderEarningEligible(order) {
  if (String(order?.orderStatus || "").toLowerCase() !== "delivered") return false;

  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  const paymentMethod = String(order.paymentMethod || "").toLowerCase();
  if (paymentStatus === "paid") return true;
  return paymentMethod === "cod";
}

function collectVendorIdsFromOrder(order) {
  const ids = new Set();

  for (const item of order.items ?? []) {
    if (item?.vendor) ids.add(String(item.vendor));
  }

  for (const row of order.vendorFulfillments ?? []) {
    if (row?.vendor) ids.add(String(row.vendor));
  }

  return [...ids];
}

async function creditVendorEarningsForDeliveredOrder(orderDoc) {
  const order =
    orderDoc && typeof orderDoc.toObject === "function" ? orderDoc.toObject() : orderDoc;

  if (!order || !isVendorOrderEarningEligible(order)) return [];

  const vendorIds = collectVendorIdsFromOrder(order);
  if (!vendorIds.length) return [];

  const commissionPercent = await getVendorCommissionPercent();
  const customerName = order.addressSnapshot?.fullName || order.addressSnapshot?.name || "";
  const credited = [];

  for (const vendorId of vendorIds) {
    const productIdSet = await getVendorProductIdSet(vendorId);
    const vendorItems = filterVendorItems(order, productIdSet, vendorId);
    if (!vendorItems.length) continue;

    const vendorEarnings = buildVendorEarningsAmount(order, vendorItems, commissionPercent);
    if (vendorEarnings <= 0) continue;

    const result = await creditVendorOrderEarning(vendorId, order, vendorEarnings, customerName);
    if (result) credited.push({ vendorId, vendorEarnings, result });
  }

  return credited;
}

function groupOrderItemsByVendor(order, productVendorMap) {
  const groups = new Map();

  for (const item of order.items ?? []) {
    const vendorId = item?.vendor
      ? String(item.vendor)
      : productVendorMap.get(String(item.product));
    if (!vendorId) continue;
    if (!groups.has(vendorId)) groups.set(vendorId, []);
    groups.get(vendorId).push(item);
  }

  return groups;
}

async function buildAdminEcomPaymentSummariesForOrders(orders = []) {
  if (!orders.length) return new Map();

  const commissionPercent = await getVendorCommissionPercent();
  const productIds = [
    ...new Set(
      orders
        .flatMap((order) => (order.items ?? []).map((item) => String(item.product)).filter(Boolean))
    ),
  ];

  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds.map((id) => toObjectId(id)) } })
        .select("addedById role")
        .lean()
    : [];
  const productVendorMap = new Map(
    products.map((product) => [
      String(product._id),
      product.role === "Vendor" && product.addedById ? String(product.addedById) : "",
    ])
  );

  const vendorIds = new Set();
  for (const order of orders) {
    for (const vendorId of groupOrderItemsByVendor(order, productVendorMap).keys()) {
      vendorIds.add(vendorId);
    }
  }

  const vendors = vendorIds.size
    ? await Vendor.find({ _id: { $in: [...vendorIds].map((id) => toObjectId(id)) } })
        .select("name businessName")
        .lean()
    : [];
  const vendorNameMap = new Map(
    vendors.map((vendor) => [String(vendor._id), vendor.businessName || vendor.name || "Unknown Vendor"])
  );

  const summaries = new Map();

  for (const order of orders) {
    const groups = groupOrderItemsByVendor(order, productVendorMap);
    let adminCommission = 0;
    let vendorAmount = 0;
    const vendorNames = [];

    for (const [vendorId, vendorItems] of groups) {
      vendorNames.push(vendorNameMap.get(vendorId) || "Unknown Vendor");
      const merchandise = sumItemMerchandise(vendorItems);
      const lineTotal = sumItemTotals(vendorItems);
      const taxAmount = money(Math.max(0, lineTotal - merchandise));
      const shippingShare = computeVendorShippingShare(order, merchandise);
      const commissionAmount = money((merchandise * commissionPercent) / 100);
      adminCommission += commissionAmount;
      vendorAmount += money(merchandise + taxAmount + shippingShare - commissionAmount);
    }

    summaries.set(String(order._id), {
      vendorName: vendorNames.length ? vendorNames.join(", ") : "—",
      adminCommission: Math.round(adminCommission * 100) / 100,
      vendorAmount: Math.round(vendorAmount * 100) / 100,
      shippingCharge: Number(order.shippingCharge) || 0,
      totalAmount: Number(order.grandTotal) || 0,
      adminCommissionPercent: commissionPercent,
    });
  }

  return summaries;
}

module.exports = {
  isVendorOrderEarningEligible,
  creditVendorEarningsForDeliveredOrder,
  buildAdminEcomPaymentSummariesForOrders,
};
