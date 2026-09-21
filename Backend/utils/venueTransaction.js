const VenueTransaction = require("../models/other/venueTransaction");
const VenueOrder = require("../models/other/venueOrder");
const AppError = require("./AppError");
const { resolvePayableAmountForOrder } = require("./venueBooking");

const { STATUS_LABELS, PAYMENT_METHOD_LABELS } = require("./transactionHistory");

function makeVenueTransactionId(orderNumber, suffix = "") {
  const slug = String(orderNumber || "")
    .replace(/^VO-/i, "")
    .trim();
  const extra = suffix ? `-${suffix}` : "";
  return `TXN-${slug || Date.now().toString(36).toUpperCase()}${extra}`;
}

function resolveTransactionStatus(paymentMethod, paymentStatus) {
  const method = String(paymentMethod || "online").toLowerCase();
  const payStatus = String(paymentStatus || "pending").toLowerCase();

  if (payStatus === "paid") return "success";
  if (payStatus === "partially_paid") return "success";
  if (payStatus === "failed") return "failed";
  if (payStatus === "refunded" || payStatus === "partially_refunded") return "refunded";
  if (method === "wallet") return "success";
  if (method === "cod") return "pending";
  return "initiated";
}

function readGatewayPaymentId(body = {}) {
  return (
    String(
      body.gatewayPaymentId ??
        body.gateway_payment_id ??
        body.razorpay_payment_id ??
        body.razorpayPaymentId ??
        ""
    ).trim() || ""
  );
}

function readPaidAmount(body = {}) {
  const raw =
    body.paidAmount ??
    body.payableAmount ??
    body.amountPaid ??
    body.amount ??
    body.totalAmount;
  if (raw === undefined || raw === null || raw === "") return null;
  const amount = Number(raw);
  return Number.isNaN(amount) ? null : amount;
}

function isVenuePaymentConfirmed(body = {}) {
  const explicit = String(body.paymentStatus ?? "").trim().toLowerCase();
  if (explicit === "paid" || explicit === "partially_paid") return true;

  const flag = body.paymentConfirmed;
  if (flag === true || flag === "true" || flag === 1 || flag === "1") return true;

  return Boolean(readGatewayPaymentId(body));
}

function resolveInitialVenuePaymentStatus(paymentMethod, body = {}, orderContext = {}) {
  const method = String(paymentMethod || "online").toLowerCase();
  if (method === "cod") return "pending";
  if (method === "wallet") {
    return orderContext.usesTokenPayment ? "partially_paid" : "paid";
  }
  if (method === "online" && isVenuePaymentConfirmed(body)) {
    return orderContext.usesTokenPayment ? "partially_paid" : "paid";
  }
  return "pending";
}

function resolvePaymentPhaseForOrder(order, paymentStatus = "") {
  const status = String(paymentStatus || order?.paymentStatus || "").toLowerCase();
  const tokenPct = Number(order?.tokenAmountPercentage) || 0;
  const tokenAmount = Number(order?.tokenAmount) || 0;

  if (status === "partially_paid") return "balance";
  if (tokenPct > 0 && tokenAmount > 0) return "token";
  return "full";
}

function applyVenueOrderPaymentState(doc, paidIncrement) {
  const grandTotal = Number(doc.grandTotal) || 0;
  const increment = Math.max(0, Number(paidIncrement) || 0);
  const nextPaid = Math.min(grandTotal, (Number(doc.amountPaid) || 0) + increment);

  doc.amountPaid = nextPaid;
  doc.remainingAmount = Math.max(0, grandTotal - nextPaid);

  if (nextPaid >= grandTotal && grandTotal > 0) {
    doc.paymentStatus = "paid";
    doc.remainingAmount = 0;
  } else if (nextPaid > 0) {
    doc.paymentStatus = "partially_paid";
  } else {
    doc.paymentStatus = "pending";
  }

  if (nextPaid > 0 && String(doc.orderStatus || "").toLowerCase() === "pending") {
    doc.orderStatus = "confirmed";
  }
}

async function markVenueOrderPaymentPaid(orderRef, options = {}) {
  const orderId = orderRef?._id ?? orderRef;
  if (!orderId) throw new AppError("Invalid order for payment update", 400);

  const doc = orderRef?.save ? orderRef : await VenueOrder.findById(orderId);
  if (!doc) throw new AppError("Booking not found", 404);

  const grandTotal = Number(doc.grandTotal) || 0;
  const amountPaid = Number(doc.amountPaid) || 0;
  const paymentStatus = String(doc.paymentStatus || "").toLowerCase();
  if (paymentStatus === "paid" && amountPaid >= grandTotal && grandTotal > 0) {
    const fresh = await VenueOrder.findById(doc._id).lean();
    const transaction = await VenueTransaction.findOne({
      order: doc._id,
      type: "payment",
      status: "success",
    })
      .sort({ createdAt: -1 })
      .lean();
    return { order: fresh, transaction };
  }

  const payableNow = resolvePayableAmountForOrder(doc);
  const maxPayable = Math.max(0, grandTotal - amountPaid);

  const explicitPaid = readPaidAmount(options);
  let paidIncrement =
    explicitPaid === null ? (payableNow > 0 ? payableNow : maxPayable) : explicitPaid;

  if (paidIncrement > maxPayable) paidIncrement = maxPayable;
  if (paidIncrement <= 0) {
    if (maxPayable <= 0) {
      throw new AppError("No outstanding amount for this booking", 400);
    }
    paidIncrement = payableNow > 0 ? Math.min(payableNow, maxPayable) : maxPayable;
  }

  const now = new Date();
  const gatewayPaymentId = String(options.gatewayPaymentId || "").trim();
  const gateway = String(options.gateway || "").trim();
  const gatewayOrderId = String(options.gatewayOrderId || "").trim();
  const paymentPhase = resolvePaymentPhaseForOrder(doc, paymentStatus);

  applyVenueOrderPaymentState(doc, paidIncrement);
  await doc.save();

  let tx = await VenueTransaction.findOne({
    order: doc._id,
    type: "payment",
    paymentPhase,
  });

  if (!tx && paymentPhase === "token") {
    tx = await VenueTransaction.findOne({ order: doc._id, type: "payment", paymentPhase: "full" });
    if (tx) {
      tx.paymentPhase = "token";
      tx.amount = paidIncrement;
    }
  }

  if (!tx) {
    tx = await VenueTransaction.create({
      order: doc._id,
      user: doc.user,
      transactionId: makeVenueTransactionId(
        doc.orderNumber,
        paymentPhase === "balance" ? "BAL" : paymentPhase === "token" ? "TOK" : ""
      ),
      paymentMethod: doc.paymentMethod,
      type: "payment",
      paymentPhase,
      status: "success",
      amount: paidIncrement,
      currency: "INR",
      remarks:
        paymentPhase === "balance"
          ? `Venue booking balance ${doc.orderNumber}`
          : paymentPhase === "token"
            ? `Venue booking token ${doc.orderNumber}`
            : `Venue booking ${doc.orderNumber}`,
      processedAt: now,
      gatewayPaymentId,
      gateway,
      gatewayOrderId,
      providerResponse: options.providerResponse && typeof options.providerResponse === "object"
        ? options.providerResponse
        : {},
    });
  } else {
    tx.status = "success";
    tx.amount = paidIncrement;
    tx.processedAt = now;
    if (gatewayPaymentId) tx.gatewayPaymentId = gatewayPaymentId;
    if (gateway) tx.gateway = gateway;
    if (gatewayOrderId) tx.gatewayOrderId = gatewayOrderId;
    if (options.providerResponse && typeof options.providerResponse === "object") {
      tx.providerResponse = options.providerResponse;
    }
    await tx.save();
  }

  const fresh = await VenueOrder.findById(doc._id).lean();
  const transaction = tx.toObject ? tx.toObject() : tx;

  return { order: fresh, transaction };
}

/**
 * Create exactly one payment transaction per venue order phase (idempotent).
 */
async function createVenueTransactionForOrder(order, options = {}) {
  if (!order?._id) throw new AppError("Invalid order for transaction", 400);

  const paymentPhase = options.paymentPhase || resolvePaymentPhaseForOrder(order);
  const amount =
    options.amount ??
    (paymentPhase === "token"
      ? Number(order.tokenAmount) || 0
      : paymentPhase === "balance"
        ? Number(order.remainingAmount) || 0
        : Number(order.grandTotal) || 0);

  const existing = await VenueTransaction.findOne({
    order: order._id,
    type: "payment",
    paymentPhase,
  }).lean();

  if (existing) return existing;

  const paymentMethod = String(order.paymentMethod || "online").toLowerCase();
  const status = resolveTransactionStatus(paymentMethod, order.paymentStatus);
  const processedAt = status === "success" ? order.placedAt ?? new Date() : null;

  try {
    const transaction = await VenueTransaction.create({
      order: order._id,
      user: order.user,
      transactionId: makeVenueTransactionId(
        order.orderNumber,
        paymentPhase === "balance" ? "BAL" : paymentPhase === "token" ? "TOK" : ""
      ),
      paymentMethod,
      type: "payment",
      paymentPhase,
      status,
      amount,
      currency: "INR",
      remarks:
        paymentPhase === "token"
          ? `Venue booking token ${order.orderNumber}`
          : paymentPhase === "balance"
            ? `Venue booking balance ${order.orderNumber}`
            : `Venue booking ${order.orderNumber}`,
      processedAt,
    });

    return transaction.toObject ? transaction.toObject() : transaction;
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await VenueTransaction.findOne({
        order: order._id,
        type: "payment",
        paymentPhase,
      }).lean();
      if (dup) return dup;
    }
    throw err;
  }
}

async function cancelVenueTransactionForOrder(order, reason) {
  const txs = await VenueTransaction.find({ order: order._id, type: "payment" });
  if (!txs.length) return null;

  const now = new Date();
  for (const tx of txs) {
    tx.status = "cancelled";
    tx.remarks = String(reason || "").trim() || tx.remarks;
    tx.processedAt = now;
    await tx.save();
  }

  const last = txs[txs.length - 1];
  return last.toObject ? last.toObject() : last;
}

module.exports = {
  createVenueTransactionForOrder,
  cancelVenueTransactionForOrder,
  markVenueOrderPaymentPaid,
  makeVenueTransactionId,
  resolveTransactionStatus,
  resolveInitialVenuePaymentStatus,
  resolvePaymentPhaseForOrder,
  isVenuePaymentConfirmed,
  readGatewayPaymentId,
  readPaidAmount,
};
