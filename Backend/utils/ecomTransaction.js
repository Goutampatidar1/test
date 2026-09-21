const Transaction = require("../models/other/transaction");
const AppError = require("./AppError");
const { resolveTransactionStatus } = require("./venueTransaction");

function makeEcomTransactionId(orderNumber) {
  const slug = String(orderNumber || "")
    .replace(/^EO-/i, "")
    .trim();
  return `TXN-${slug || Date.now().toString(36).toUpperCase()}`;
}

async function createEcomTransactionForOrder(order, options = {}) {
  if (!order?._id) throw new AppError("Invalid order for transaction", 400);

  const existing = await Transaction.findOne({
    order: order._id,
    type: "payment",
  }).lean();

  if (existing) return existing;

  const paymentMethod = String(order.paymentMethod || "cod").toLowerCase();
  const status = resolveTransactionStatus(paymentMethod, order.paymentStatus);
  const processedAt = status === "success" ? order.placedAt ?? new Date() : null;

  try {
    const transaction = await Transaction.create({
      order: order._id,
      user: order.user,
      transactionId: makeEcomTransactionId(order.orderNumber),
      paymentMethod,
      gateway: options.gateway ?? "",
      gatewayOrderId: options.gatewayOrderId ?? "",
      gatewayPaymentId: options.gatewayPaymentId ?? "",
      providerResponse: options.providerResponse ?? {},
      type: "payment",
      status,
      amount: order.grandTotal ?? 0,
      currency: "INR",
      remarks: options.remarks || `Order ${order.orderNumber}`,
      processedAt,
    });

    return transaction.toObject ? transaction.toObject() : transaction;
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await Transaction.findOne({ order: order._id, type: "payment" }).lean();
      if (dup) return dup;
    }
    throw err;
  }
}

async function cancelEcomTransactionForOrder(order, reason, { refunded = false } = {}) {
  const tx = await Transaction.findOne({ order: order._id, type: "payment" });
  if (!tx) return null;

  tx.status = refunded ? "refunded" : "cancelled";
  tx.remarks = String(reason || "").trim() || tx.remarks;
  tx.processedAt = new Date();
  await tx.save();
  return tx.toObject ? tx.toObject() : tx;
}

async function createEcomRefundTransaction(order, options = {}) {
  if (!order?._id) throw new AppError("Invalid order for refund transaction", 400);

  const existing = await Transaction.findOne({
    order: order._id,
    type: "refund",
  }).lean();

  if (existing) return existing;

  const amount = Number(options.amount ?? order.grandTotal) || 0;
  const slug = String(order.orderNumber || "")
    .replace(/^EO-/i, "")
    .trim();

  try {
    const transaction = await Transaction.create({
      order: order._id,
      user: order.user,
      transactionId: `REF-${slug || Date.now().toString(36).toUpperCase()}`,
      paymentMethod: String(order.paymentMethod || "wallet").toLowerCase(),
      gateway: options.gateway ?? "",
      type: "refund",
      status: "success",
      amount,
      currency: "INR",
      remarks: options.reason || `Refund for order ${order.orderNumber}`,
      processedAt: new Date(),
    });

    return transaction.toObject ? transaction.toObject() : transaction;
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await Transaction.findOne({ order: order._id, type: "refund" }).lean();
      if (dup) return dup;
    }
    throw err;
  }
}

module.exports = {
  createEcomTransactionForOrder,
  cancelEcomTransactionForOrder,
  createEcomRefundTransaction,
  makeEcomTransactionId,
};
