const VenueTransaction = require("../models/other/venueTransaction");
const VenueOrder = require("../models/other/venueOrder");
const AppError = require("./AppError");
const { buildBookingPaymentSummary } = require("./venueBooking");

const { STATUS_LABELS, PAYMENT_METHOD_LABELS } = require("./transactionHistory");

function makeVenueTransactionId(orderNumber, suffix = "") {
  const slug = String(orderNumber || "")
    .replace(/^(VO|BK)-/i, "")
    .trim();
  const extra = suffix ? `-${suffix}` : "";
  return `TXN-${slug || String(Date.now()).slice(-8)}${extra}`;
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
  const paymentType = String(body.paymentType || body.payment_type || "").trim().toLowerCase();
  // amountPaid is the running total. remainingAmount is not this charge and not the new balance.
  const raw =
    body.paidAmount ??
    body.payableAmount ??
    body.amount ??
    (paymentType === "remaining" ? undefined : body.amountPaid);
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
  const tokenAmount = Number(order?.tokenAmount) || 0;
  const grandTotal = Number(order?.grandTotal) || 0;
  const amountPaid = Number(order?.amountPaid) || 0;
  const usesToken = tokenAmount > 0 && (grandTotal <= 0 || tokenAmount < grandTotal);

  // Use collected amount, not paymentStatus alone — partially_paid used to always map to
  // "balance", so a second token confirm (create + confirm) double-counted the deposit.
  if (usesToken) {
    if (amountPaid + 0.001 < tokenAmount) return "token";
    if (amountPaid + 0.001 < grandTotal) return "balance";
    return "balance";
  }

  const status = String(paymentStatus || order?.paymentStatus || "").toLowerCase();
  if (status === "partially_paid") return "balance";
  return "full";
}

function applyVenueOrderPaymentState(doc, paidIncrement, basePaid) {
  const grandTotal = Number(doc.grandTotal) || 0;
  const increment = Math.max(0, Number(paidIncrement) || 0);
  const alreadyPaid = basePaid == null ? Number(doc.amountPaid) || 0 : Number(basePaid) || 0;
  const nextPaid = Math.min(grandTotal, alreadyPaid + increment);

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

function amountsNearlyEqual(a, b, eps = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

/**
 * Create+confirm used to apply the token twice: first as token, then again as a "balance"
 * txn for the same ₹token (e.g. Amount Paid ₹1000 when token is ₹500). Undo that fingerprint.
 */
async function repairDoubleCountedTokenDeposit(doc, figures) {
  const grandTotal = Number(doc.grandTotal) || 0;
  const tokenAmount = Number(figures.tokenAmount) || Number(doc.tokenAmount) || 0;
  const amountPaid = Number(figures.amountPaid) || 0;
  if (!(tokenAmount > 0 && tokenAmount < grandTotal)) return figures;
  if (!amountsNearlyEqual(amountPaid, tokenAmount * 2)) return figures;
  if (amountPaid + 0.01 >= grandTotal) return figures;

  const txs = await VenueTransaction.find({
    order: doc._id,
    type: "payment",
    status: "success",
  });

  const tokenTx = txs.find((tx) => String(tx.paymentPhase || "").toLowerCase() === "token");
  const balanceTx = txs.find((tx) => String(tx.paymentPhase || "").toLowerCase() === "balance");
  if (!tokenTx || !balanceTx) return figures;
  if (!amountsNearlyEqual(balanceTx.amount, tokenAmount)) return figures;
  if (!amountsNearlyEqual(tokenTx.amount, tokenAmount) && Number(tokenTx.amount) > tokenAmount + 0.01) {
    return figures;
  }

  const sameGateway =
    tokenTx.gatewayPaymentId &&
    balanceTx.gatewayPaymentId &&
    String(tokenTx.gatewayPaymentId) === String(balanceTx.gatewayPaymentId);

  // Same Razorpay id = definite duplicate. Equal token-sized balance without a larger pay-in
  // is the create→confirm double-count fingerprint (BK-872038-class).
  if (!sameGateway && Number(balanceTx.amount) !== Number(tokenAmount)) return figures;

  balanceTx.status = "cancelled";
  balanceTx.remarks = `${balanceTx.remarks || ""} (cancelled duplicate token confirm)`.trim();
  await balanceTx.save();

  doc.amountPaid = tokenAmount;
  doc.remainingAmount = Math.max(0, grandTotal - tokenAmount);
  doc.paymentStatus = "partially_paid";
  await doc.save();

  return buildBookingPaymentSummary(doc);
}

/**
 * If ledger says fully paid but only a token (or under-full) success txn exists and no balance
 * txn, rewrite amountPaid/remaining so remaining confirm is not blocked (BK-619597-class rows).
 */
async function repairStaleTokenLedgerFromTransactions(doc, figures) {
  const grandTotal = Number(doc.grandTotal) || 0;
  const tokenAmount = Number(figures.tokenAmount) || Number(doc.tokenAmount) || 0;
  if (!(tokenAmount > 0 && tokenAmount < grandTotal)) return figures;

  let next = await repairDoubleCountedTokenDeposit(doc, figures);
  if (next.amountPaid !== figures.amountPaid || next.remainingAmount !== figures.remainingAmount) {
    figures = next;
  }

  if (
    !(
      figures.paymentStatus === "paid" &&
      figures.amountPaid >= grandTotal &&
      figures.remainingAmount <= 0 &&
      grandTotal > 0
    )
  ) {
    return figures;
  }

  const txs = await VenueTransaction.find({
    order: doc._id,
    type: "payment",
    status: "success",
  }).lean();

  if (!txs.length) return figures;
  if (txs.some((tx) => String(tx.paymentPhase || "").toLowerCase() === "balance")) {
    return figures;
  }

  const collected = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  if (!(collected > 0 && collected < grandTotal)) return figures;

  // Deposit-only: prefer tokenAmount; fall back to collected when token missing/mismatched.
  const repairedPaid =
    tokenAmount > 0 && collected <= tokenAmount
      ? collected || tokenAmount
      : tokenAmount > 0
        ? tokenAmount
        : collected;

  doc.amountPaid = repairedPaid;
  doc.remainingAmount = Math.max(0, grandTotal - repairedPaid);
  doc.paymentStatus = "partially_paid";
  await doc.save();

  return buildBookingPaymentSummary(doc);
}

/** Persist ledger repairs for detail/confirm responses (mutates DB when needed). */
async function repairVenueOrderPaymentLedger(orderRef) {
  const doc = orderRef?.save ? orderRef : await VenueOrder.findById(orderRef?._id ?? orderRef);
  if (!doc) return null;
  let figures = buildBookingPaymentSummary(doc);
  figures = await repairStaleTokenLedgerFromTransactions(doc, figures);
  return { order: doc, figures };
}

async function markVenueOrderPaymentPaid(orderRef, options = {}) {
  const orderId = orderRef?._id ?? orderRef;
  if (!orderId) throw new AppError("Invalid order for payment update", 400);

  const doc = orderRef?.save ? orderRef : await VenueOrder.findById(orderId);
  if (!doc) throw new AppError("Booking not found", 404);

  const grandTotal = Number(doc.grandTotal) || 0;
  let figures = buildBookingPaymentSummary(doc);
  figures = await repairStaleTokenLedgerFromTransactions(doc, figures);
  const amountPaid = figures.amountPaid;
  const paymentStatus = figures.paymentStatus;
  const tokenAmount = Number(figures.tokenAmount) || Number(doc.tokenAmount) || 0;
  const gatewayPaymentId = String(options.gatewayPaymentId || "").trim();
  const paymentType = String(options.paymentType || options.payment_type || "").trim().toLowerCase();

  if (gatewayPaymentId) {
    const existingByGateway = await VenueTransaction.findOne({
      order: doc._id,
      type: "payment",
      status: "success",
      gatewayPaymentId,
    })
      .sort({ createdAt: -1 })
      .lean();
    if (existingByGateway) {
      const fresh = await VenueOrder.findById(doc._id).lean();
      return { order: fresh, transaction: existingByGateway };
    }
  }

  if (paymentStatus === "paid" && amountPaid >= grandTotal && figures.remainingAmount <= 0 && grandTotal > 0) {
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

  // Token already on the ledger — ignore a second *token-sized* confirm (create+confirm).
  // Remaining / balance charges (amount > token, or paymentType remaining|balance) must apply.
  if (
    tokenAmount > 0 &&
    amountPaid + 0.01 >= tokenAmount &&
    amountPaid + 0.01 < grandTotal &&
    paymentType !== "remaining" &&
    paymentType !== "balance"
  ) {
    const explicitPaid = readPaidAmount(options);
    const isTokenSizedCharge =
      explicitPaid != null && explicitPaid > 0 && explicitPaid <= tokenAmount + 0.01;
    const looksLikeTokenReplay =
      isTokenSizedCharge && (paymentType === "token" || paymentType === "" || paymentType === "full");
    if (looksLikeTokenReplay) {
      const fresh = await VenueOrder.findById(doc._id).lean();
      const transaction = await VenueTransaction.findOne({
        order: doc._id,
        type: "payment",
        status: "success",
        paymentPhase: { $in: ["token", "full"] },
      })
        .sort({ createdAt: -1 })
        .lean();
      return { order: fresh, transaction };
    }
  }

  const payableNow = figures.amountDueNow;
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
  const gateway = String(options.gateway || "").trim();
  const gatewayOrderId = String(options.gatewayOrderId || "").trim();
  const paymentPhase = resolvePaymentPhaseForOrder(
    { ...doc.toObject(), amountPaid, paymentStatus, remainingAmount: figures.remainingAmount },
    paymentStatus
  );

  applyVenueOrderPaymentState(doc, paidIncrement, amountPaid);
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
  repairVenueOrderPaymentLedger,
  makeVenueTransactionId,
  resolveTransactionStatus,
  resolveInitialVenuePaymentStatus,
  resolvePaymentPhaseForOrder,
  isVenuePaymentConfirmed,
  readGatewayPaymentId,
  readPaidAmount,
};
