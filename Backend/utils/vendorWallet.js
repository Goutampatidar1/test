const mongoose = require("mongoose");
const Vendor = require("../models/entity/vendor");
const VendorWalletTransaction = require("../models/other/vendorWalletTransaction");
const VendorWithdrawalRequest = require("../models/other/vendorWithdrawalRequest");
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
  return `VWT-${stamp}${rand}`;
}

function makeWithdrawalRequestNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VWR-${stamp}-${rand}`;
}

function snapshotBankDetails(vendor) {
  return {
    bankAccountName: String(vendor.accountHolderName || "").trim(),
    accountNumber: String(vendor.accountNo || "").trim(),
    bankName: String(vendor.bankName || "").trim(),
    branchName: String(vendor.branchName || "").trim(),
    ifscCode: String(vendor.ifsc || "").trim(),
    accountType: String(vendor.accountType || "").trim(),
  };
}

function assertBankDetails(vendor) {
  const bank = snapshotBankDetails(vendor);
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

async function getVendorWalletBalance(vendorId) {
  const vendor = await Vendor.findById(vendorId).select("walletBalance").lean();
  if (!vendor) throw new AppError("Account not found", 404);
  return normalizeAmount(vendor.walletBalance);
}

async function creditVendorWallet(vendorId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) {
    return getVendorWalletBalance(vendorId);
  }

  const vendor = await Vendor.findOneAndUpdate(
    { _id: toObjectId(vendorId) },
    { $inc: { walletBalance: value } },
    { new: true }
  ).select("walletBalance");

  if (!vendor) throw new AppError("Account not found", 404);
  return normalizeAmount(vendor.walletBalance);
}

async function debitVendorWallet(vendorId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) {
    throw new AppError("Invalid wallet debit amount", 400);
  }

  const vendor = await Vendor.findOneAndUpdate(
    { _id: toObjectId(vendorId), walletBalance: { $gte: value } },
    { $inc: { walletBalance: -value } },
    { new: true }
  ).select("walletBalance");

  if (!vendor) {
    const balance = await getVendorWalletBalance(vendorId);
    throw new AppError(
      balance < value
        ? `Insufficient wallet balance. Available balance is ${formatInrAmount(balance)}`
        : "Unable to debit wallet",
      400
    );
  }

  return normalizeAmount(vendor.walletBalance);
}

async function createVendorWithdrawalRequest(vendorId, amountRaw) {
  const amount = normalizeAmount(amountRaw);
  if (amount <= 0) {
    throw new AppError("Withdrawal amount must be greater than zero", 400);
  }

  const vendor = await Vendor.findById(vendorId).select(
    "walletBalance accountHolderName accountNo bankName branchName ifsc accountType name businessName"
  );
  if (!vendor) throw new AppError("Account not found", 404);

  const bank = assertBankDetails(vendor);

  const pending = await VendorWithdrawalRequest.findOne({
    vendor: vendor._id,
    status: "pending",
  }).select("_id requestNumber");

  if (pending) {
    throw new AppError(
      `You already have a pending withdrawal request (${pending.requestNumber})`,
      400
    );
  }

  const walletBalance = await debitVendorWallet(vendor._id, amount);
  const requestNumber = makeWithdrawalRequestNumber();
  const transactionId = makeWalletTransactionId();

  const walletTransaction = await VendorWalletTransaction.create({
    vendor: vendor._id,
    transactionId,
    direction: "debit",
    category: "withdrawal",
    amount,
    status: "pending",
    title: "Withdrawal",
    remarks: `Withdrawal request ${requestNumber}`,
  });

  const withdrawalRequest = await VendorWithdrawalRequest.create({
    vendor: vendor._id,
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

async function processVendorWithdrawalRequest(requestId, adminId, payload = {}) {
  const status = String(payload.status || "")
    .trim()
    .toLowerCase();

  if (!["approved", "rejected"].includes(status)) {
    throw new AppError("Status must be approved or rejected", 400);
  }

  const request = await VendorWithdrawalRequest.findById(requestId);
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
    ? await VendorWalletTransaction.findById(request.walletTransaction)
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

    const walletBalance = await getVendorWalletBalance(request.vendor);
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

  const walletBalance = await creditVendorWallet(request.vendor, request.amount);

  return {
    request: request.toObject(),
    walletTransaction: walletTransaction?.toObject() ?? null,
    walletBalance,
  };
}

async function getVendorLifetimeEarnings(vendorId) {
  const result = await VendorWalletTransaction.aggregate([
    {
      $match: {
        vendor: toObjectId(vendorId),
        direction: "credit",
        category: "order_earning",
        status: "success",
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return normalizeAmount(result[0]?.total || 0);
}

async function creditVendorOrderEarning(vendorId, order, earningAmount, title = "") {
  const amount = normalizeAmount(earningAmount);
  if (amount <= 0 || !vendorId) return null;

  const existing = await VendorWalletTransaction.findOne({
    vendor: toObjectId(vendorId),
    order: order?._id ?? order,
    category: "order_earning",
    status: { $ne: "cancelled" },
  }).select("_id");

  if (existing) return existing;

  const walletBalance = await creditVendorWallet(vendorId, amount);
  const transaction = await VendorWalletTransaction.create({
    vendor: vendorId,
    transactionId: makeWalletTransactionId(),
    direction: "credit",
    category: "order_earning",
    amount,
    status: "success",
    order: order?._id ?? order ?? null,
    title: title || "Order earning",
    remarks: order?.orderNumber ? `Earning for order ${order.orderNumber}` : "Order earning",
    processedAt: new Date(),
  });

  return { transaction: transaction.toObject(), walletBalance };
}

module.exports = {
  normalizeAmount,
  formatInrAmount,
  makeWalletTransactionId,
  getVendorWalletBalance,
  getVendorLifetimeEarnings,
  creditVendorWallet,
  debitVendorWallet,
  createVendorWithdrawalRequest,
  processVendorWithdrawalRequest,
  creditVendorOrderEarning,
};
