const mongoose = require("mongoose");
const User = require("../models/entity/user");
const WalletTransaction = require("../models/other/walletTransaction");
const Transaction = require("../models/other/transaction");
const AppError = require("./AppError");
const { createEcomRefundTransaction } = require("./ecomTransaction");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

async function getUserWalletBalance(userId) {
  const user = await User.findById(userId).select("walletBalance").lean();
  if (!user) throw new AppError("User not found", 404);
  return normalizeAmount(user.walletBalance);
}

async function creditUserWallet(userId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) {
    return getUserWalletBalance(userId);
  }

  const user = await User.findOneAndUpdate(
    { _id: toObjectId(userId) },
    { $inc: { walletBalance: value } },
    { new: true }
  ).select("walletBalance");

  if (!user) throw new AppError("User not found", 404);
  return normalizeAmount(user.walletBalance);
}

async function debitUserWallet(userId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) {
    throw new AppError("Invalid wallet debit amount", 400);
  }

  const user = await User.findOneAndUpdate(
    { _id: toObjectId(userId), walletBalance: { $gte: value } },
    { $inc: { walletBalance: -value } },
    { new: true }
  ).select("walletBalance");

  if (!user) {
    const balance = await getUserWalletBalance(userId);
    throw new AppError(
      balance < value
        ? `Insufficient wallet balance. Available balance is ₹${balance.toLocaleString("en-IN")}`
        : "Unable to debit wallet",
      400
    );
  }

  return normalizeAmount(user.walletBalance);
}

function makeWalletOrderTransactionId(orderNumber) {
  const slug = String(orderNumber || "")
    .replace(/^EO-/i, "")
    .trim();
  return `WPO-${slug || Date.now().toString(36).toUpperCase()}`;
}

async function createWalletPaymentForOrder(userId, order, amount) {
  if (!order?._id) throw new AppError("Invalid order for wallet payment", 400);

  const existing = await WalletTransaction.findOne({
    order: order._id,
    type: "payment",
  }).lean();

  if (existing) return existing;

  const value = normalizeAmount(amount ?? order.grandTotal);
  const transactionId = makeWalletOrderTransactionId(order.orderNumber);

  try {
    const walletTxn = await WalletTransaction.create({
      user: toObjectId(userId),
      order: order._id,
      transactionId,
      amount: value,
      type: "payment",
      status: "success",
      currency: "INR",
      remarks: `Wallet payment for order ${order.orderNumber}`,
      processedAt: new Date(),
    });
    return walletTxn.toObject ? walletTxn.toObject() : walletTxn;
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await WalletTransaction.findOne({ order: order._id, type: "payment" }).lean();
      if (dup) return dup;
    }
    throw err;
  }
}

function normalizePaymentMethod(value) {
  return String(value || "").trim().toLowerCase();
}

function isCodPaymentMethod(value) {
  const method = normalizePaymentMethod(value);
  return (
    method === "cod" ||
    method === "cash" ||
    method === "cash_on_delivery" ||
    method === "cashondelivery"
  );
}

function emptyRefundResult(walletBalance = null) {
  return {
    refunded: false,
    alreadyRefunded: false,
    refundAmount: 0,
    walletBalance,
  };
}

/**
 * Wallet refunds only apply when money was actually collected digitally
 * (wallet or online). COD is collected at delivery, so cancelling an unpaid
 * COD order must not credit the user's wallet.
 */
function isDigitallyPaidOrder(order) {
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  const paymentMethod = normalizePaymentMethod(order.paymentMethod);

  if (isCodPaymentMethod(paymentMethod)) return false;
  if (paymentStatus !== "paid" && paymentStatus !== "partially_paid") return false;
  return paymentMethod === "wallet" || paymentMethod === "online";
}

async function hasCollectedDigitalPayment(order) {
  if (!isDigitallyPaidOrder(order)) return false;

  const paymentMethod = normalizePaymentMethod(order.paymentMethod);
  if (paymentMethod === "wallet") {
    const debit = await WalletTransaction.findOne({
      order: order._id,
      type: "payment",
      status: "success",
    })
      .select("_id")
      .lean();
    return Boolean(debit);
  }

  const paidTx = await Transaction.findOne({
    order: order._id,
    type: "payment",
    status: "success",
  })
    .select("_id")
    .lean();
  return Boolean(paidTx);
}

async function shouldRefundOrderToWallet(order) {
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  if (paymentStatus === "refunded") return false;
  if (isCodPaymentMethod(order.paymentMethod)) return false;
  if (!(await hasCollectedDigitalPayment(order))) return false;

  const existingRefund = await Transaction.findOne({
    order: order._id,
    type: "refund",
    status: "success",
  })
    .select("_id")
    .lean();

  if (existingRefund) return false;

  return normalizeAmount(order.grandTotal) > 0;
}

async function refundEcomOrderToWallet(order, reason = "") {
  if (isCodPaymentMethod(order.paymentMethod) || !(await hasCollectedDigitalPayment(order))) {
    return emptyRefundResult(await getUserWalletBalance(order.user));
  }

  const existingRefund = await Transaction.findOne({
    order: order._id,
    type: "refund",
    status: "success",
  }).lean();

  if (existingRefund) {
    return {
      refunded: false,
      alreadyRefunded: true,
      refundAmount: normalizeAmount(existingRefund.amount),
      walletBalance: await getUserWalletBalance(order.user),
    };
  }

  const refundAmount = normalizeAmount(order.grandTotal);
  if (refundAmount <= 0) {
    return emptyRefundResult(await getUserWalletBalance(order.user));
  }

  const walletBalance = await creditUserWallet(order.user, refundAmount);
  await createEcomRefundTransaction(order, {
    amount: refundAmount,
    reason: reason || `Refund for cancelled order ${order.orderNumber}`,
  });

  return {
    refunded: true,
    alreadyRefunded: false,
    refundAmount,
    walletBalance,
  };
}

function parseWalletTopUpAmount(value) {
  if (value === undefined || value === null || value === "") {
    throw new AppError("amount is required", 400);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("amount must be greater than 0", 400);
  }
  return normalizeAmount(amount);
}

function parseWalletTransactionId(value) {
  const transactionId = String(value ?? "").trim();
  if (!transactionId) {
    throw new AppError("transaction_id is required", 400);
  }
  return transactionId;
}

async function addWalletTopUp(userId, transactionIdRaw, amountRaw) {
  const transactionId = parseWalletTransactionId(transactionIdRaw);
  const amount = parseWalletTopUpAmount(amountRaw);

  const existing = await WalletTransaction.findOne({ transactionId }).lean();
  if (existing) {
    if (String(existing.user) !== String(userId)) {
      throw new AppError("Invalid transaction_id", 400);
    }
    if (normalizeAmount(existing.amount) !== amount) {
      throw new AppError("amount does not match this transaction_id", 400);
    }
    if (existing.status === "success") {
      return {
        alreadyCredited: true,
        walletBalance: await getUserWalletBalance(userId),
        transaction: existing,
      };
    }
    throw new AppError("Transaction cannot be credited", 400);
  }

  let walletTxn;
  try {
    walletTxn = await WalletTransaction.create({
      user: toObjectId(userId),
      transactionId,
      amount,
      type: "topup",
      status: "success",
      currency: "INR",
      remarks: "Wallet top-up",
      processedAt: new Date(),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return addWalletTopUp(userId, transactionId, amount);
    }
    throw err;
  }

  const walletBalance = await creditUserWallet(userId, amount);
  return {
    alreadyCredited: false,
    walletBalance,
    transaction: walletTxn.toObject ? walletTxn.toObject() : walletTxn,
  };
}

module.exports = {
  getUserWalletBalance,
  creditUserWallet,
  debitUserWallet,
  createWalletPaymentForOrder,
  isCodPaymentMethod,
  isDigitallyPaidOrder,
  shouldRefundOrderToWallet,
  refundEcomOrderToWallet,
  addWalletTopUp,
  parseWalletTopUpAmount,
  parseWalletTransactionId,
  makeWalletOrderTransactionId,
};
