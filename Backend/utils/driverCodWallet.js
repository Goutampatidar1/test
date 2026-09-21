const mongoose = require("mongoose");
const DeliveryBoy = require("../models/entity/deliveryboy");
const Order = require("../models/other/order");
const Transaction = require("../models/other/transaction");
const DeliveryWalletTransaction = require("../models/other/deliveryWalletTransaction");
const DriverCodSettlement = require("../models/other/driverCodSettlement");
const AppError = require("./AppError");
const { normalizeAmount, formatInrAmount, makeWalletTransactionId } = require("./deliveryWallet");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function makeSettlementNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DCS-${stamp}-${rand}`;
}

function orderCodPendingAmount(order) {
  const total = normalizeAmount(order?.grandTotal);
  const settled = normalizeAmount(order?.codSettledAmount);
  return normalizeAmount(Math.max(0, total - settled));
}

function isCodOrderPendingSettlement(order) {
  if (String(order?.paymentMethod || "").toLowerCase() !== "cod") return false;
  if (String(order?.orderStatus || "").toLowerCase() !== "delivered") return false;
  if (String(order?.codSettlementStatus || "").toLowerCase() === "settled") return false;
  return orderCodPendingAmount(order) > 0;
}

async function markEcomOrderPaymentPaid(orderRef, options = {}) {
  const orderId = orderRef?._id ?? orderRef;
  if (!orderId) return null;

  const tx = await Transaction.findOne({ order: orderId, type: "payment" });
  if (!tx) return null;

  if (String(tx.status || "").toLowerCase() !== "success") {
    tx.status = "success";
    tx.processedAt = new Date();
    if (options.remarks) {
      tx.remarks = String(options.remarks).trim() || tx.remarks;
    }
    await tx.save();
  }

  return tx.toObject ? tx.toObject() : tx;
}

async function getDriverCodPendingBalance(deliveryBoyId) {
  const driver = await DeliveryBoy.findById(deliveryBoyId).select("codPendingBalance").lean();
  if (!driver) throw new AppError("Account not found", 404);
  return normalizeAmount(driver.codPendingBalance);
}

async function creditDriverCodPending(deliveryBoyId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) return getDriverCodPendingBalance(deliveryBoyId);

  const driver = await DeliveryBoy.findOneAndUpdate(
    { _id: toObjectId(deliveryBoyId) },
    { $inc: { codPendingBalance: value } },
    { new: true }
  ).select("codPendingBalance");

  if (!driver) throw new AppError("Account not found", 404);
  return normalizeAmount(driver.codPendingBalance);
}

async function debitDriverCodPending(deliveryBoyId, amount) {
  const value = normalizeAmount(amount);
  if (value <= 0) throw new AppError("Settlement amount must be greater than zero", 400);

  const driver = await DeliveryBoy.findOneAndUpdate(
    { _id: toObjectId(deliveryBoyId), codPendingBalance: { $gte: value } },
    { $inc: { codPendingBalance: -value } },
    { new: true }
  ).select("codPendingBalance");

  if (!driver) {
    const balance = await getDriverCodPendingBalance(deliveryBoyId);
    throw new AppError(
      balance < value
        ? `Settlement amount cannot exceed pending COD balance of ${formatInrAmount(balance)}`
        : "Unable to settle COD amount",
      400
    );
  }

  return normalizeAmount(driver.codPendingBalance);
}

async function listDriverPendingCodOrders(deliveryBoyId, { page = 1, limit = 20 } = {}) {
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const filter = {
    codCollectedBy: toObjectId(deliveryBoyId),
    paymentMethod: "cod",
    orderStatus: "delivered",
    codSettlementStatus: { $ne: "settled" },
  };

  const [rows, total] = await Promise.all([
    Order.find(filter)
      .sort({ codCollectedAt: 1, placedAt: 1 })
      .skip(skip)
      .limit(Math.max(1, limit))
      .select("orderNumber grandTotal codSettledAmount codCollectedAt codSettlementStatus placedAt paymentStatus")
      .lean(),
    Order.countDocuments(filter),
  ]);

  const items = rows
    .map((row) => {
      const pendingAmount = orderCodPendingAmount(row);
      if (pendingAmount <= 0) return null;
      return {
        _id: row._id,
        orderNumber: row.orderNumber,
        grandTotal: normalizeAmount(row.grandTotal),
        codSettledAmount: normalizeAmount(row.codSettledAmount),
        pendingAmount,
        pendingAmountLabel: formatInrAmount(pendingAmount),
        codCollectedAt: row.codCollectedAt || row.placedAt,
        codSettlementStatus: row.codSettlementStatus || "pending",
      };
    })
    .filter(Boolean);

  return {
    items,
    pagination: {
      page: Math.max(1, page),
      limit: Math.max(1, limit),
      total,
      pages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
    },
  };
}

async function listDriverCodSettlements(deliveryBoyId, { page = 1, limit = 20 } = {}) {
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const filter = { deliveryBoy: toObjectId(deliveryBoyId) };

  const [rows, total] = await Promise.all([
    DriverCodSettlement.find(filter)
      .populate("processedBy", "name email")
      .sort({ processedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(Math.max(1, limit))
      .lean(),
    DriverCodSettlement.countDocuments(filter),
  ]);

  return {
    items: rows.map((row) => ({
      _id: row._id,
      settlementNumber: row.settlementNumber,
      amount: normalizeAmount(row.amount),
      amountLabel: formatInrAmount(row.amount),
      previousBalance: normalizeAmount(row.previousBalance),
      balanceAfter: normalizeAmount(row.balanceAfter),
      adminNote: row.adminNote || "",
      processedAt: row.processedAt || row.createdAt,
      processedBy: row.processedBy || null,
      orderAllocations: row.orderAllocations || [],
    })),
    pagination: {
      page: Math.max(1, page),
      limit: Math.max(1, limit),
      total,
      pages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
    },
  };
}

async function listDriversCodSummary({ page = 1, limit = 20, search, onlyPending = false } = {}) {
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const filter = {};

  if (onlyPending) {
    filter.codPendingBalance = { $gt: 0 };
  }

  if (search) {
    const term = String(search).trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const [rows, total] = await Promise.all([
    DeliveryBoy.find(filter)
      .select("name email phone profileImage codPendingBalance walletBalance status approvalStatus")
      .sort({ codPendingBalance: -1, name: 1 })
      .skip(skip)
      .limit(Math.max(1, limit))
      .lean(),
    DeliveryBoy.countDocuments(filter),
  ]);

  return {
    items: rows.map((row) => ({
      _id: row._id,
      name: row.name || "",
      email: row.email || "",
      phone: row.phone || "",
      profileImage: row.profileImage || "",
      status: row.status || "",
      approvalStatus: row.approvalStatus || "",
      codPendingBalance: normalizeAmount(row.codPendingBalance),
      codPendingBalanceLabel: formatInrAmount(row.codPendingBalance),
      walletBalance: normalizeAmount(row.walletBalance),
    })),
    pagination: {
      page: Math.max(1, page),
      limit: Math.max(1, limit),
      total,
      pages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
    },
  };
}

async function allocateCodSettlementToOrders(driverId, settleAmount) {
  let remaining = normalizeAmount(settleAmount);
  if (remaining <= 0) return [];

  const orders = await Order.find({
    codCollectedBy: toObjectId(driverId),
    paymentMethod: "cod",
    orderStatus: "delivered",
    codSettlementStatus: { $ne: "settled" },
  })
    .sort({ codCollectedAt: 1, placedAt: 1 })
    .select("_id orderNumber grandTotal codSettledAmount codSettlementStatus")
    .lean();

  const allocations = [];

  for (const order of orders) {
    if (remaining <= 0) break;

    const pendingOnOrder = orderCodPendingAmount(order);
    if (pendingOnOrder <= 0) continue;

    const applied = normalizeAmount(Math.min(remaining, pendingOnOrder));
    const newSettled = normalizeAmount(normalizeAmount(order.codSettledAmount) + applied);
    const grandTotal = normalizeAmount(order.grandTotal);
    const isFullySettled = newSettled >= grandTotal - 0.009;

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          codSettledAmount: newSettled,
          codSettlementStatus: isFullySettled ? "settled" : newSettled > 0 ? "partial" : "pending",
        },
      }
    );

    allocations.push({
      order: order._id,
      orderNumber: order.orderNumber || "",
      amount: applied,
    });

    remaining = normalizeAmount(remaining - applied);
  }

  if (remaining > 0.009) {
    throw new AppError("Could not allocate settlement across pending COD orders", 400);
  }

  return allocations;
}

async function recordDriverCodCollection(driverId, order) {
  const paymentMethod = String(order?.paymentMethod || "").toLowerCase();
  if (paymentMethod !== "cod") return null;

  const orderId = order?._id ?? order;
  const amount = normalizeAmount(order?.grandTotal);
  if (amount <= 0 || !driverId || !orderId) return null;

  const existing = await DeliveryWalletTransaction.findOne({
    deliveryBoy: toObjectId(driverId),
    order: orderId,
    category: "cod_collection",
    status: { $ne: "cancelled" },
  }).lean();

  if (existing) {
    return { alreadyRecorded: true, transaction: existing };
  }

  await markEcomOrderPaymentPaid(order, {
    remarks: `COD collected on delivery — ${order.orderNumber || ""}`.trim(),
  });

  const balanceAfter = await creditDriverCodPending(driverId, amount);

  const transaction = await DeliveryWalletTransaction.create({
    deliveryBoy: driverId,
    transactionId: makeWalletTransactionId(),
    direction: "credit",
    category: "cod_collection",
    amount,
    status: "success",
    order: orderId,
    title: "COD collection",
    remarks: `Cash collected for order ${order.orderNumber || ""}`.trim(),
    processedAt: new Date(),
  });

  return {
    transaction: transaction.toObject(),
    codPendingBalance: balanceAfter,
  };
}

async function settleDriverCodBalance(driverId, amountRaw, adminId, adminNote = "") {
  const amount = normalizeAmount(amountRaw);
  if (amount <= 0) {
    throw new AppError("Settlement amount must be greater than zero", 400);
  }

  const previousBalance = await getDriverCodPendingBalance(driverId);

  if (amount > previousBalance) {
    throw new AppError(
      `Settlement amount cannot exceed pending COD balance of ${formatInrAmount(previousBalance)}`,
      400
    );
  }

  const note = String(adminNote || "").trim();
  let balanceAfter = previousBalance;
  let allocations = [];
  let debited = false;

  try {
    balanceAfter = await debitDriverCodPending(driverId, amount);
    debited = true;
    allocations = await allocateCodSettlementToOrders(driverId, amount);
  } catch (error) {
    if (debited) {
      await creditDriverCodPending(driverId, amount).catch(() => {});
    }
    throw error;
  }

  const ledger = await DeliveryWalletTransaction.create({
    deliveryBoy: driverId,
    transactionId: makeWalletTransactionId(),
    direction: "debit",
    category: "cod_settlement",
    amount,
    status: "success",
    title: "COD settlement",
    remarks: note || "COD cash handover to admin",
    processedAt: new Date(),
  });

  const settlement = await DriverCodSettlement.create({
    deliveryBoy: driverId,
    settlementNumber: makeSettlementNumber(),
    amount,
    previousBalance,
    balanceAfter,
    adminNote: note,
    processedBy: adminId,
    processedAt: new Date(),
    ledgerTransaction: ledger._id,
    orderAllocations: allocations,
  });

  await DeliveryWalletTransaction.updateOne({ _id: ledger._id }, { $set: { codSettlement: settlement._id } });

  return {
    settlement: settlement.toObject(),
    ledgerTransaction: ledger.toObject(),
    codPendingBalance: balanceAfter,
    codPendingBalanceLabel: formatInrAmount(balanceAfter),
    allocations,
  };
}

async function getDriverCodSummary(deliveryBoyId) {
  const driver = await DeliveryBoy.findById(deliveryBoyId)
    .select("name email phone profileImage codPendingBalance walletBalance")
    .lean();

  if (!driver) throw new AppError("Delivery partner not found", 404);

  const [pendingOrders, recentSettlements, lifetimeCollected] = await Promise.all([
    listDriverPendingCodOrders(deliveryBoyId, { page: 1, limit: 5 }),
    listDriverCodSettlements(deliveryBoyId, { page: 1, limit: 5 }),
    DeliveryWalletTransaction.aggregate([
      {
        $match: {
          deliveryBoy: toObjectId(deliveryBoyId),
          category: "cod_collection",
          status: "success",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const totalCollected = normalizeAmount(lifetimeCollected[0]?.total || 0);
  const totalSettled = normalizeAmount(totalCollected - normalizeAmount(driver.codPendingBalance));

  return {
    driver: {
      _id: driver._id,
      name: driver.name || "",
      email: driver.email || "",
      phone: driver.phone || "",
      profileImage: driver.profileImage || "",
    },
    codPendingBalance: normalizeAmount(driver.codPendingBalance),
    codPendingBalanceLabel: formatInrAmount(driver.codPendingBalance),
    totalCodCollected: totalCollected,
    totalCodCollectedLabel: formatInrAmount(totalCollected),
    totalCodSettled: totalSettled,
    totalCodSettledLabel: formatInrAmount(totalSettled),
    pendingOrders: pendingOrders.items,
    pendingOrdersPagination: pendingOrders.pagination,
    recentSettlements: recentSettlements.items,
    settlementsPagination: recentSettlements.pagination,
  };
}

module.exports = {
  orderCodPendingAmount,
  isCodOrderPendingSettlement,
  markEcomOrderPaymentPaid,
  getDriverCodPendingBalance,
  recordDriverCodCollection,
  settleDriverCodBalance,
  listDriverPendingCodOrders,
  listDriverCodSettlements,
  listDriversCodSummary,
  getDriverCodSummary,
};
