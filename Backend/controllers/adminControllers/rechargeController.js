const Recharge = require("../../models/other/recharge");
const RechargeTransaction = require("../../models/other/rechargeTransaction");
const {
  MobileRechargeDetail,
  GasRechargeDetail,
  FastagRechargeDetail,
} = require("../../models/other/rechargeDetails");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");

const ALLOWED_TYPES = new Set(["mobile", "gas", "fastag"]);
const ALLOWED_STATUSES = new Set(["pending", "success", "failed"]);
const ALLOWED_TRANSACTION_TYPES = new Set(["payment", "refund"]);
const ALLOWED_TRANSACTION_STATUSES = new Set([
  "initiated",
  "pending",
  "success",
  "failed",
  "cancelled",
  "refunded",
]);
const ALLOWED_PAYMENT_METHODS = new Set(["upi", "card", "netbanking", "wallet", "cod"]);

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function makeTransactionId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RTX-${stamp}-${rand}`;
}

async function hydrateTypeDetails(recharges) {
  const mobileIds = [];
  const gasIds = [];
  const fastagIds = [];

  for (const row of recharges) {
    if (!row?.detailRef || !row?.detailModel) continue;
    if (row.detailModel === "MobileRechargeDetail") mobileIds.push(row.detailRef);
    if (row.detailModel === "GasRechargeDetail") gasIds.push(row.detailRef);
    if (row.detailModel === "FastagRechargeDetail") fastagIds.push(row.detailRef);
  }

  const [mobileRows, gasRows, fastagRows] = await Promise.all([
    mobileIds.length ? MobileRechargeDetail.find({ _id: { $in: mobileIds } }).lean() : [],
    gasIds.length ? GasRechargeDetail.find({ _id: { $in: gasIds } }).lean() : [],
    fastagIds.length ? FastagRechargeDetail.find({ _id: { $in: fastagIds } }).lean() : [],
  ]);

  const mobileMap = new Map(mobileRows.map((item) => [String(item._id), item]));
  const gasMap = new Map(gasRows.map((item) => [String(item._id), item]));
  const fastagMap = new Map(fastagRows.map((item) => [String(item._id), item]));

  return recharges.map((row) => {
    const key = String(row.detailRef || "");
    if (row.detailModel === "MobileRechargeDetail") {
      return { ...row, typeDetails: mobileMap.get(key) || {} };
    }
    if (row.detailModel === "GasRechargeDetail") {
      return { ...row, typeDetails: gasMap.get(key) || {} };
    }
    if (row.detailModel === "FastagRechargeDetail") {
      return { ...row, typeDetails: fastagMap.get(key) || {} };
    }
    return { ...row, typeDetails: row.details || {} };
  });
}

exports.listRecharges = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { type, status, userId, search } = req.query;

  const filter = {};
  if (type) {
    const typeValue = normalizeRequired(type).toLowerCase();
    if (!ALLOWED_TYPES.has(typeValue)) throw new AppError("Invalid recharge type filter", 400);
    filter.type = typeValue;
  }
  if (status) {
    const statusValue = normalizeRequired(status).toLowerCase();
    if (!ALLOWED_STATUSES.has(statusValue)) throw new AppError("Invalid recharge status filter", 400);
    filter.status = statusValue;
  }
  if (userId) {
    assertObjectId(userId, "Invalid userId filter");
    filter.user = userId;
  }

  const searchRx = normalizeOptional(search);
  if (searchRx) {
    const searchOr = searchFilter(searchRx, ["contactNumber", "provider", "referenceId"]);
    if (searchOr) {
      filter.$or = searchOr.$or;
    }
  }

  const [recharges, total] = await Promise.all([
    Recharge.find(filter)
      .populate("user", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Recharge.countDocuments(filter),
  ]);
  const rechargesWithDetails = await hydrateTypeDetails(recharges);

  res.json({
    recharges: rechargesWithDetails,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.createRecharge = asyncHandler(async (req, res) => {
  const type = normalizeRequired(req.body.type).toLowerCase();
  const user = normalizeRequired(req.body.user);
  const contactNumber = normalizeRequired(req.body.contactNumber);
  const amount = Number(req.body.amount);
  const provider = normalizeOptional(req.body.provider) || "";
  const referenceId = normalizeOptional(req.body.referenceId) || "";
  const status = (normalizeOptional(req.body.status) || "success").toLowerCase();
  const details = asObject(req.body.details);
  const transactionMeta = asObject(req.body.transaction);

  if (!ALLOWED_TYPES.has(type)) throw new AppError("Invalid recharge type", 400);
  if (!ALLOWED_STATUSES.has(status)) throw new AppError("Invalid recharge status", 400);
  assertObjectId(user, "Invalid user id");
  if (!contactNumber) throw new AppError("contactNumber is required", 400);
  if (Number.isNaN(amount) || amount < 0) throw new AppError("Invalid amount", 400);

  let detailModel = null;
  let detailRef = null;
  if (type === "mobile") {
    const mobileDetail = await MobileRechargeDetail.create({
      operator: normalizeOptional(details.operator) || "",
      plan: normalizeOptional(details.plan) || "",
    });
    detailModel = "MobileRechargeDetail";
    detailRef = mobileDetail._id;
  } else if (type === "gas") {
    const gasDetail = await GasRechargeDetail.create({
      bookingRef: normalizeOptional(details.bookingRef) || "",
      consumerNo: normalizeOptional(details.consumerNo) || "",
      bookedAt: details.bookedAt ? new Date(details.bookedAt) : null,
      eta: details.eta ? new Date(details.eta) : null,
      updateMessage: normalizeOptional(details.updateMessage) || "",
    });
    detailModel = "GasRechargeDetail";
    detailRef = gasDetail._id;
  } else if (type === "fastag") {
    const fastagDetail = await FastagRechargeDetail.create({
      bookingRef: normalizeOptional(details.bookingRef) || "",
      consumerNo: normalizeOptional(details.consumerNo) || "",
      bookedAt: details.bookedAt ? new Date(details.bookedAt) : null,
      eta: details.eta ? new Date(details.eta) : null,
      updateMessage: normalizeOptional(details.updateMessage) || "",
      vehicleNumber: normalizeOptional(details.vehicleNumber) || "",
    });
    detailModel = "FastagRechargeDetail";
    detailRef = fastagDetail._id;
  }

  const recharge = await Recharge.create({
    type,
    user,
    contactNumber,
    amount,
    provider,
    referenceId,
    status,
    detailModel,
    detailRef,
    details,
  });

  const transactionType = (normalizeOptional(transactionMeta.type) || "payment").toLowerCase();
  const transactionStatus = (normalizeOptional(transactionMeta.status) || status).toLowerCase();
  const paymentMethod = (normalizeOptional(transactionMeta.paymentMethod) || "upi").toLowerCase();
  const gateway = normalizeOptional(transactionMeta.gateway) || provider || "";
  const gatewayOrderId = normalizeOptional(transactionMeta.gatewayOrderId) || "";
  const gatewayPaymentId = normalizeOptional(transactionMeta.gatewayPaymentId) || "";
  const transactionReferenceId = normalizeOptional(transactionMeta.referenceId) || referenceId;
  const transactionId = normalizeOptional(transactionMeta.transactionId) || makeTransactionId();
  const remarks = normalizeOptional(transactionMeta.remarks) || "";
  const currency = normalizeOptional(transactionMeta.currency) || "INR";
  const providerResponse = asObject(transactionMeta.providerResponse);

  if (!ALLOWED_TRANSACTION_TYPES.has(transactionType)) {
    throw new AppError("Invalid recharge transaction type", 400);
  }
  if (!ALLOWED_TRANSACTION_STATUSES.has(transactionStatus)) {
    throw new AppError("Invalid recharge transaction status", 400);
  }
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    throw new AppError("Invalid payment method", 400);
  }

  const rechargeTransaction = await RechargeTransaction.create({
    recharge: recharge._id,
    user,
    rechargeType: type,
    transactionId,
    referenceId: transactionReferenceId,
    gateway,
    gatewayOrderId,
    gatewayPaymentId,
    type: transactionType,
    status: transactionStatus,
    paymentMethod,
    amount,
    currency,
    providerResponse,
    remarks,
    processedAt: transactionMeta.processedAt ? new Date(transactionMeta.processedAt) : null,
  });

  const fresh = await Recharge.findById(recharge._id).populate("user", "name phone").lean();
  const [hydrated] = await hydrateTypeDetails([fresh]);
  res.status(201).json({
    message: "Recharge created",
    recharge: hydrated,
    rechargeTransaction,
  });
});

exports.listRechargeTransactions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { userId, rechargeId, rechargeType, status, type, paymentMethod, search } = req.query;

  const filter = {};
  if (userId) {
    assertObjectId(userId, "Invalid userId filter");
    filter.user = userId;
  }
  if (rechargeId) {
    assertObjectId(rechargeId, "Invalid rechargeId filter");
    filter.recharge = rechargeId;
  }
  if (rechargeType) {
    const value = normalizeRequired(rechargeType).toLowerCase();
    if (!ALLOWED_TYPES.has(value)) throw new AppError("Invalid rechargeType filter", 400);
    filter.rechargeType = value;
  }
  if (status) {
    const value = normalizeRequired(status).toLowerCase();
    if (!ALLOWED_TRANSACTION_STATUSES.has(value)) throw new AppError("Invalid transaction status filter", 400);
    filter.status = value;
  }
  if (type) {
    const value = normalizeRequired(type).toLowerCase();
    if (!ALLOWED_TRANSACTION_TYPES.has(value)) throw new AppError("Invalid transaction type filter", 400);
    filter.type = value;
  }
  if (paymentMethod) {
    const value = normalizeRequired(paymentMethod).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(value)) throw new AppError("Invalid payment method filter", 400);
    filter.paymentMethod = value;
  }

  const searchRx = normalizeOptional(search);
  if (searchRx) {
    const searchOr = searchFilter(searchRx, ["transactionId", "referenceId", "gatewayOrderId", "gatewayPaymentId", "gateway", "remarks"]);
    if (searchOr) {
      filter.$or = searchOr.$or;
    }
  }

  const [transactions, total] = await Promise.all([
    RechargeTransaction.find(filter)
      .populate("user", "name phone")
      .populate("recharge", "type contactNumber amount provider referenceId status createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RechargeTransaction.countDocuments(filter),
  ]);

  res.json({
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getRechargeTransactionById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const transaction = await RechargeTransaction.findById(req.params.id)
    .populate("user", "name phone email")
    .populate("recharge", "type contactNumber amount provider referenceId status createdAt")
    .lean();
  if (!transaction) throw new AppError("Transaction not found", 404);
  res.json({ transaction });
});
