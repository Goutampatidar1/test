const mongoose = require("mongoose");
const DeliveryBoy = require("../models/entity/deliveryboy");
const DeliveryWalletTransaction = require("../models/other/deliveryWalletTransaction");
const DeliveryWithdrawalRequest = require("../models/other/deliveryWithdrawalRequest");
const AppError = require("./AppError");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

function formatInrAmount(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function makeWalletTransactionId() {
  const stamp = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `TXN-${stamp}${rand}`;
}

function makeWithdrawalRequestNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DWR-${stamp}-${rand}`;
}

function snapshotBankDetails(driver) {
  return {
    bankAccountName: String(driver.bankAccountName || "").trim(),
    accountNumber: String(driver.accountNumber || "").trim(),
    bankName: String(driver.bankName || "").trim(),
    branchName: String(driver.branchName || "").trim(),
    ifscCode: String(driver.ifscCode || "").trim(),
  };
}

function assertBankDetails(driver) {
  const bank = snapshotBankDetails(driver);
  const missing = [];
  if (!bank.bankAccountName) missing.push("account holder name");
  if (!bank.accountNumber) missing.push("account number");
  if (!bank.bankName) missing.push("bank name");
  if (!bank.ifscCode) missing.push("IFSC code");

  if (missing.length) {
    throw new AppError(
      `Add your bank details in profile before requesting withdrawal (${missing.join(", ")})`,
      400
    );
  }

  return bank;
}

async function getDriverWalletBalance(deliveryBoyId) {
  const driver = await DeliveryBoy.findById(deliveryBoyId).select("walletBalance").lean();
  if (!driver) throw new AppError("Account not found", 404);
  return normalizeAmount(driver.walletBalance);
}

async function creditDriverWallet(deliveryBoyId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) {
    return getDriverWalletBalance(deliveryBoyId);
  }

  const driver = await DeliveryBoy.findOneAndUpdate(
    { _id: toObjectId(deliveryBoyId) },
    { $inc: { walletBalance: value } },
    { new: true }
  ).select("walletBalance");

  if (!driver) throw new AppError("Account not found", 404);
  return normalizeAmount(driver.walletBalance);
}

async function debitDriverWallet(deliveryBoyId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) {
    throw new AppError("Invalid wallet debit amount", 400);
  }

  const driver = await DeliveryBoy.findOneAndUpdate(
    { _id: toObjectId(deliveryBoyId), walletBalance: { $gte: value } },
    { $inc: { walletBalance: -value } },
    { new: true }
  ).select("walletBalance");

  if (!driver) {
    const balance = await getDriverWalletBalance(deliveryBoyId);
    throw new AppError(
      balance < value
        ? `Insufficient wallet balance. Available balance is ${formatInrAmount(balance)}`
        : "Unable to debit wallet",
      400
    );
  }

  return normalizeAmount(driver.walletBalance);
}

async function createDriverWithdrawalRequest(deliveryBoyId, amountRaw) {
  const amount = normalizeAmount(amountRaw);
  if (amount <= 0) {
    throw new AppError("Withdrawal amount must be greater than zero", 400);
  }

  const driver = await DeliveryBoy.findById(deliveryBoyId).select(
    "walletBalance bankAccountName accountNumber bankName branchName ifscCode name"
  );
  if (!driver) throw new AppError("Account not found", 404);

  const bank = assertBankDetails(driver);

  const pending = await DeliveryWithdrawalRequest.findOne({
    deliveryBoy: driver._id,
    status: "pending",
  }).select("_id requestNumber");

  if (pending) {
    throw new AppError(
      `You already have a pending withdrawal request (${pending.requestNumber})`,
      400
    );
  }

  const walletBalance = await debitDriverWallet(driver._id, amount);
  const requestNumber = makeWithdrawalRequestNumber();
  const transactionId = makeWalletTransactionId();

  const walletTransaction = await DeliveryWalletTransaction.create({
    deliveryBoy: driver._id,
    transactionId,
    direction: "debit",
    category: "withdrawal",
    amount,
    status: "pending",
    title: "Withdrawal",
    remarks: `Withdrawal request ${requestNumber}`,
  });

  const withdrawalRequest = await DeliveryWithdrawalRequest.create({
    deliveryBoy: driver._id,
    requestNumber,
    amount,
    status: "pending",
    ...bank,
    walletTransaction: walletTransaction._id,
  });

  walletTransaction.withdrawalRequest = withdrawalRequest._id;
  await walletTransaction.save();

  return {
    withdrawalRequest: withdrawalRequest.toObject(),
    walletTransaction: walletTransaction.toObject(),
    walletBalance,
  };
}

async function processDriverWithdrawalRequest(requestId, adminId, payload = {}) {
  const status = String(payload.status || "")
    .trim()
    .toLowerCase();

  if (!["approved", "rejected"].includes(status)) {
    throw new AppError("Status must be approved or rejected", 400);
  }

  const request = await DeliveryWithdrawalRequest.findById(requestId);
  if (!request) throw new AppError("Withdrawal request not found", 404);

  if (request.status !== "pending") {
    throw new AppError(`Withdrawal request is already ${request.status}`, 400);
  }

  const adminNote = String(payload.adminNote ?? payload.note ?? "").trim();
  const rejectionReason = String(
    payload.rejectionReason ?? payload.reason ?? payload.remarks ?? ""
  ).trim();

  if (status === "rejected" && !rejectionReason) {
    throw new AppError("Rejection reason is required", 400);
  }

  const walletTransaction = request.walletTransaction
    ? await DeliveryWalletTransaction.findById(request.walletTransaction)
    : null;

  const now = new Date();

  if (status === "approved") {
    request.status = "approved";
    request.adminNote = adminNote;
    request.processedBy = adminId;
    request.processedAt = now;
    await request.save();

    if (walletTransaction) {
      walletTransaction.status = "success";
      walletTransaction.processedAt = now;
      await walletTransaction.save();
    }

    const walletBalance = await getDriverWalletBalance(request.deliveryBoy);
    return {
      request: request.toObject(),
      walletTransaction: walletTransaction?.toObject() ?? null,
      walletBalance,
    };
  }

  request.status = "rejected";
  request.adminNote = adminNote;
  request.rejectionReason = rejectionReason;
  request.processedBy = adminId;
  request.processedAt = now;
  await request.save();

  if (walletTransaction) {
    walletTransaction.status = "cancelled";
    walletTransaction.processedAt = now;
    walletTransaction.remarks = rejectionReason || walletTransaction.remarks;
    await walletTransaction.save();
  }

  const walletBalance = await creditDriverWallet(request.deliveryBoy, request.amount);

  return {
    request: request.toObject(),
    walletTransaction: walletTransaction?.toObject() ?? null,
    walletBalance,
  };
}

async function getDriverLifetimeEarnings(deliveryBoyId) {
  const result = await DeliveryWalletTransaction.aggregate([
    {
      $match: {
        deliveryBoy: toObjectId(deliveryBoyId),
        direction: "credit",
        category: "delivery_earning",
        status: "success",
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return normalizeAmount(result[0]?.total || 0);
}

async function creditDriverDeliveryEarning(deliveryBoyId, order, earningAmount, customerName = "") {
  const amount = normalizeAmount(earningAmount);
  if (amount <= 0 || !deliveryBoyId) return null;

  const existing = await DeliveryWalletTransaction.findOne({
    deliveryBoy: toObjectId(deliveryBoyId),
    order: order?._id ?? order,
    category: "delivery_earning",
    status: { $ne: "cancelled" },
  }).select("_id");

  if (existing) return existing;

  const walletBalance = await creditDriverWallet(deliveryBoyId, amount);
  const transaction = await DeliveryWalletTransaction.create({
    deliveryBoy: deliveryBoyId,
    transactionId: makeWalletTransactionId(),
    direction: "credit",
    category: "delivery_earning",
    amount,
    status: "success",
    order: order?._id ?? order ?? null,
    title: customerName || "Delivery earning",
    remarks: order?.orderNumber ? `Earning for order ${order.orderNumber}` : "Delivery earning",
    processedAt: new Date(),
  });

  return { transaction: transaction.toObject(), walletBalance };
}

module.exports = {
  normalizeAmount,
  formatInrAmount,
  makeWalletTransactionId,
  getDriverWalletBalance,
  getDriverLifetimeEarnings,
  creditDriverWallet,
  debitDriverWallet,
  createDriverWithdrawalRequest,
  processDriverWithdrawalRequest,
  creditDriverDeliveryEarning,
};
