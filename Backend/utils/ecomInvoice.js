const fs = require("fs");
const mongoose = require("mongoose");
const Order = require("../models/other/order");
const Product = require("../models/other/product");
const User = require("../models/entity/user");
const { AppConfig } = require("../models");
const AppError = require("./AppError");
const { buildInvoicePayload } = require("./ecomOrder");
const { generateInvoicePdfFile, absoluteInvoicePath } = require("./ecomInvoicePdf");

const { resolveInvoiceUrls } = require("./ecomInvoiceUrls");

async function loadOrderForInvoice(orderId) {
  const order = await Order.findById(orderId).lean();
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  return order;
}

async function assertVendorOrderAccess(vendorId, order) {
  const vendorOid = new mongoose.Types.ObjectId(String(vendorId));
  const productIds = [...new Set((order.items ?? []).map((item) => String(item.product)).filter(Boolean))];

  const vendorProducts = productIds.length
    ? await Product.find({
        _id: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) },
        addedById: vendorOid,
      })
        .select("_id")
        .lean()
    : [];

  const vendorProductSet = new Set(vendorProducts.map((row) => String(row._id)));
  const hasItems = (order.items ?? []).some(
    (item) =>
      (item.vendor && String(item.vendor) === String(vendorId)) ||
      vendorProductSet.has(String(item.product))
  );

  if (!hasItems) {
    throw new AppError("Order not found", 404);
  }
}

async function buildInvoiceDataForOrder(order, baseUrl) {
  const user = await User.findById(order.user).select("name phone email").lean();
  const config = await AppConfig.findOne().select("app_name").lean();
  const payload = buildInvoicePayload(order, user, baseUrl);
  payload.appName = config?.app_name || "OHO E-Bazar";
  return payload;
}

async function ensureOrderInvoicePdf(orderId, baseUrl) {
  const order = await loadOrderForInvoice(orderId);
  const invoiceData = await buildInvoiceDataForOrder(order, baseUrl);
  const savedPath = await generateInvoicePdfFile(invoiceData, order.orderNumber);

  await Order.updateOne({ _id: order._id }, { $set: { invoicePdf: savedPath } });

  const freshOrder = { ...order, invoicePdf: savedPath };
  return {
    order: freshOrder,
    invoice: resolveInvoiceUrls(freshOrder, baseUrl),
    invoiceData,
  };
}

async function getUserOrderInvoice(userId, orderId, baseUrl) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const result = await ensureOrderInvoicePdf(orderId, baseUrl);
  const invoiceData = result.invoiceData || (await buildInvoiceDataForOrder(result.order, baseUrl));

  return {
    ...invoiceData,
    ...result.invoice,
  };
}

async function getAdminOrderInvoice(orderId, baseUrl) {
  const result = await ensureOrderInvoicePdf(orderId, baseUrl);
  const invoiceData = result.invoiceData || (await buildInvoiceDataForOrder(result.order, baseUrl));

  return {
    ...invoiceData,
    ...result.invoice,
  };
}

async function getVendorOrderInvoice(vendorId, orderId, baseUrl) {
  const order = await loadOrderForInvoice(orderId);
  await assertVendorOrderAccess(vendorId, order);

  const result = await ensureOrderInvoicePdf(orderId, baseUrl);
  const invoiceData = result.invoiceData || (await buildInvoiceDataForOrder(result.order, baseUrl));

  return {
    ...invoiceData,
    ...result.invoice,
  };
}

function resolveInvoicePdfAbsolutePath(invoicePdf) {
  if (!invoicePdf) return null;
  const absolutePath = absoluteInvoicePath(invoicePdf);
  return fs.existsSync(absolutePath) ? absolutePath : null;
}

module.exports = {
  ensureOrderInvoicePdf,
  getUserOrderInvoice,
  getAdminOrderInvoice,
  getVendorOrderInvoice,
  resolveInvoicePdfAbsolutePath,
};