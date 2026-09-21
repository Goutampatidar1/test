const VenueTransaction = require("../../models/other/venueTransaction");
const VenueOrder = require("../../models/other/venueOrder");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");

const ALLOWED_TRANSACTION_STATUSES = new Set(["initiated", "pending", "success", "failed", "cancelled", "refunded"]);
const ALLOWED_TRANSACTION_TYPES = new Set(["payment", "refund"]);
const ALLOWED_PAYMENT_METHODS = new Set(["cod", "online", "wallet"]);

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
  return `VTX-${stamp}-${rand}`;
}

exports.listTransactions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { orderId, userId, status, type, paymentMethod, search } = req.query;

  const filter = {};
  if (orderId) {
    assertObjectId(orderId, "Invalid orderId filter");
    filter.order = orderId;
  }
  if (userId) {
    assertObjectId(userId, "Invalid userId filter");
    filter.user = userId;
  }
  if (status) {
    const value = normalizeRequired(status).toLowerCase();
    if (!ALLOWED_TRANSACTION_STATUSES.has(value)) throw new AppError("Invalid status filter", 400);
    filter.status = value;
  }
  if (type) {
    const value = normalizeRequired(type).toLowerCase();
    if (!ALLOWED_TRANSACTION_TYPES.has(value)) throw new AppError("Invalid type filter", 400);
    filter.type = value;
  }
  if (paymentMethod) {
    const value = normalizeRequired(paymentMethod).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(value)) throw new AppError("Invalid paymentMethod filter", 400);
    filter.paymentMethod = value;
  }

  const searchOr = searchFilter(search, ["transactionId", "gatewayOrderId", "gatewayPaymentId", "gateway", "remarks"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [transactions, total] = await Promise.all([
    VenueTransaction.find(filter)
      .populate("order", "orderNumber grandTotal orderStatus paymentStatus")
      .populate("user", "name phone email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueTransaction.countDocuments(filter),
  ]);

  res.json({
    transactions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getTransactionById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const transaction = await VenueTransaction.findById(req.params.id)
    .populate("order", "orderNumber grandTotal orderStatus paymentStatus")
    .populate("user", "name phone email")
    .lean();
  if (!transaction) throw new AppError("Venue transaction not found", 404);
  res.json({ transaction });
});

exports.createTransaction = asyncHandler(async (req, res) => {
  const order = normalizeRequired(req.body.order);
  const user = normalizeRequired(req.body.user);
  const status = (normalizeOptional(req.body.status) || "initiated").toLowerCase();
  const type = (normalizeOptional(req.body.type) || "payment").toLowerCase();
  const paymentMethod = (normalizeOptional(req.body.paymentMethod) || "online").toLowerCase();
  const amount = Number(req.body.amount ?? 0);
  const transactionId = normalizeOptional(req.body.transactionId) || makeTransactionId();
  const gateway = normalizeOptional(req.body.gateway) || "";
  const gatewayOrderId = normalizeOptional(req.body.gatewayOrderId) || "";
  const gatewayPaymentId = normalizeOptional(req.body.gatewayPaymentId) || "";
  const currency = normalizeOptional(req.body.currency) || "INR";
  const providerResponse = asObject(req.body.providerResponse);
  const remarks = normalizeOptional(req.body.remarks) || "";
  const processedAt = req.body.processedAt ? new Date(req.body.processedAt) : null;

  assertObjectId(order, "Invalid order id");
  assertObjectId(user, "Invalid user id");
  if (!ALLOWED_TRANSACTION_STATUSES.has(status)) throw new AppError("Invalid status", 400);
  if (!ALLOWED_TRANSACTION_TYPES.has(type)) throw new AppError("Invalid type", 400);
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) throw new AppError("Invalid paymentMethod", 400);
  if (Number.isNaN(amount) || amount < 0) throw new AppError("Invalid amount", 400);
  if (processedAt && Number.isNaN(processedAt.getTime())) throw new AppError("Invalid processedAt", 400);

  const orderExists = await VenueOrder.findById(order).select("_id").lean();
  if (!orderExists) throw new AppError("Venue order not found", 404);

  const transaction = await VenueTransaction.create({
    order,
    user,
    transactionId,
    gatewayOrderId,
    gatewayPaymentId,
    gateway,
    paymentMethod,
    type,
    status,
    amount,
    currency,
    providerResponse,
    remarks,
    processedAt,
  });

  const fresh = await VenueTransaction.findById(transaction._id)
    .populate("order", "orderNumber grandTotal orderStatus paymentStatus")
    .populate("user", "name phone email")
    .lean();
  res.status(201).json({ message: "Venue transaction created", transaction: fresh });
});

exports.updateTransaction = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const transaction = await VenueTransaction.findById(req.params.id);
  if (!transaction) throw new AppError("Venue transaction not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status).toLowerCase();
    if (!ALLOWED_TRANSACTION_STATUSES.has(status)) throw new AppError("Invalid status", 400);
    transaction.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "type")) {
    const type = normalizeRequired(req.body.type).toLowerCase();
    if (!ALLOWED_TRANSACTION_TYPES.has(type)) throw new AppError("Invalid type", 400);
    transaction.type = type;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "paymentMethod")) {
    const paymentMethod = normalizeRequired(req.body.paymentMethod).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) throw new AppError("Invalid paymentMethod", 400);
    transaction.paymentMethod = paymentMethod;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "amount")) {
    const amount = Number(req.body.amount);
    if (Number.isNaN(amount) || amount < 0) throw new AppError("Invalid amount", 400);
    transaction.amount = amount;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "gateway")) transaction.gateway = normalizeOptional(req.body.gateway) || "";
  if (Object.prototype.hasOwnProperty.call(req.body, "gatewayOrderId")) {
    transaction.gatewayOrderId = normalizeOptional(req.body.gatewayOrderId) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "gatewayPaymentId")) {
    transaction.gatewayPaymentId = normalizeOptional(req.body.gatewayPaymentId) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "currency")) {
    transaction.currency = normalizeOptional(req.body.currency) || "INR";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "providerResponse")) {
    transaction.providerResponse = asObject(req.body.providerResponse);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "remarks")) {
    transaction.remarks = normalizeOptional(req.body.remarks) || "";
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "processedAt")) {
    const processedAt = req.body.processedAt ? new Date(req.body.processedAt) : null;
    if (processedAt && Number.isNaN(processedAt.getTime())) throw new AppError("Invalid processedAt", 400);
    transaction.processedAt = processedAt;
  }

  await transaction.save();
  const fresh = await VenueTransaction.findById(transaction._id)
    .populate("order", "orderNumber grandTotal orderStatus paymentStatus")
    .populate("user", "name phone email")
    .lean();
  res.json({ message: "Venue transaction updated", transaction: fresh });
});

exports.deleteTransaction = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const transaction = await VenueTransaction.findByIdAndDelete(req.params.id).select("_id").lean();
  if (!transaction) throw new AppError("Venue transaction not found", 404);
  res.json({ message: "Venue transaction deleted" });
});
