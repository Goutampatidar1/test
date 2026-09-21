const mongoose = require("mongoose");
const VenueOrder = require("../../models/other/venueOrder");
const Venue = require("../../models/other/venue");
const User = require("../../models/entity/user");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, orderSearchFilter, applyOrderDateRangeFilter } = require("../../utils/listQuery");
const { buildBookingPaymentSummary } = require("../../utils/venueBooking");

function enrichVenueOrderResponse(order) {
  if (!order) return order;
  const payment = buildBookingPaymentSummary(order);
  return {
    ...order,
    subTotal: payment.subTotal,
    discountTotal: payment.discountTotal,
    taxTotal: payment.taxTotal,
    grandTotal: payment.grandTotal,
    totalAmount: payment.totalAmount,
    tokenAmountPercentage: payment.tokenAmountPercentage,
    tokenAmount: payment.tokenAmount,
    amountPaid: payment.amountPaid,
    remainingAmount: payment.remainingAmount,
    amountDueNow: payment.amountDueNow,
    usesTokenPayment: payment.usesTokenPayment,
    payment,
    paymentSummary: payment,
  };
}

const ALLOWED_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
const ALLOWED_PAYMENT_STATUSES = new Set([
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "partially_paid",
]);
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

function mergeMongoFilters(...parts) {
  const active = parts.filter((part) => part && Object.keys(part).length > 0);
  if (!active.length) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

async function buildVenueVendorOrdersFilter(venueVendorId) {
  assertObjectId(venueVendorId, "Invalid venueVendorId filter");
  const venueIds = await Venue.distinct("_id", {
    addedById: new mongoose.Types.ObjectId(String(venueVendorId)),
    role: "VenueVendor",
  });
  if (!venueIds.length) {
    return { _id: null };
  }
  return { "items.venue": { $in: venueIds } };
}

function asItems(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError("items must be a non-empty array", 400);
  }
  return value;
}

async function assertVenuesExist(items) {
  const venueIds = [...new Set(items.map((item) => String(item.venue || "")).filter(Boolean))];
  for (const venueId of venueIds) assertObjectId(venueId, "Invalid venue id in items");
  const venues = await Venue.find({ _id: { $in: venueIds } }).select("_id").lean();
  if (venues.length !== venueIds.length) {
    throw new AppError("One or more venues do not exist", 404);
  }
}

function normalizeItems(items) {
  return items.map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? 0);
    const discountValue = Number(item.discountValue ?? 0);
    const taxValue = Number(item.taxValue ?? 0);
    const totalPrice = Number(item.totalPrice ?? 0);
    const bookingDate = item.bookingDate ? new Date(item.bookingDate) : null;

    if (Number.isNaN(quantity) || quantity < 1) throw new AppError("Invalid item quantity", 400);
    if (Number.isNaN(unitPrice) || unitPrice < 0) throw new AppError("Invalid item unitPrice", 400);
    if (Number.isNaN(discountValue) || discountValue < 0) throw new AppError("Invalid item discountValue", 400);
    if (Number.isNaN(taxValue) || taxValue < 0) throw new AppError("Invalid item taxValue", 400);
    if (Number.isNaN(totalPrice) || totalPrice < 0) throw new AppError("Invalid item totalPrice", 400);
    if (bookingDate && Number.isNaN(bookingDate.getTime())) throw new AppError("Invalid item bookingDate", 400);

    return {
      venue: normalizeRequired(item.venue),
      name: normalizeRequired(item.name),
      quantity,
      unitPrice,
      discountValue,
      taxValue,
      totalPrice,
      bookingDate,
      bookingSlot: normalizeOptional(item.bookingSlot) || "",
    };
  });
}

exports.listOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { userId, venueVendorId, orderStatus, paymentStatus, paymentMethod, search } = req.query;

  const baseFilter = {};
  if (userId) {
    assertObjectId(userId, "Invalid userId filter");
    baseFilter.user = userId;
  }
  if (orderStatus) {
    const value = normalizeRequired(orderStatus).toLowerCase();
    if (!ALLOWED_ORDER_STATUSES.has(value)) throw new AppError("Invalid orderStatus filter", 400);
    baseFilter.orderStatus = value;
  }
  if (paymentStatus) {
    const value = normalizeRequired(paymentStatus).toLowerCase();
    if (!ALLOWED_PAYMENT_STATUSES.has(value)) throw new AppError("Invalid paymentStatus filter", 400);
    baseFilter.paymentStatus = value;
  }
  if (paymentMethod) {
    const value = normalizeRequired(paymentMethod).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(value)) throw new AppError("Invalid paymentMethod filter", 400);
    baseFilter.paymentMethod = value;
  }

  const filterParts = [baseFilter];
  if (venueVendorId) {
    filterParts.push(await buildVenueVendorOrdersFilter(venueVendorId));
  }

  const searchOr = await orderSearchFilter(search, User);
  if (searchOr) filterParts.push(searchOr);

  const dateFilter = {};
  applyOrderDateRangeFilter(dateFilter, req.query);
  if (Object.keys(dateFilter).length) filterParts.push(dateFilter);

  const filter = mergeMongoFilters(...filterParts);

  const [orders, total] = await Promise.all([
    VenueOrder.find(filter)
      .populate("user", "name phone email")
      .populate("items.venue", "name address city basePrice thumbnail")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VenueOrder.countDocuments(filter),
  ]);

  res.json({
    orders: orders.map(enrichVenueOrderResponse),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getOrderById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const order = await VenueOrder.findById(req.params.id)
    .populate("user", "name phone email")
    .populate("items.venue", "name address city basePrice thumbnail")
    .lean();
  if (!order) throw new AppError("Venue order not found", 404);
  res.json({ order: enrichVenueOrderResponse(order) });
});

exports.createOrder = asyncHandler(async (req, res) => {
  const orderNumber = normalizeRequired(req.body.orderNumber);
  const user = normalizeRequired(req.body.user);
  const items = normalizeItems(asItems(req.body.items));
  const subTotal = Number(req.body.subTotal ?? 0);
  const discountTotal = Number(req.body.discountTotal ?? 0);
  const taxTotal = Number(req.body.taxTotal ?? 0);
  const grandTotal = Number(req.body.grandTotal ?? 0);
  const paymentMethod = (normalizeOptional(req.body.paymentMethod) || "online").toLowerCase();
  const paymentStatus = (normalizeOptional(req.body.paymentStatus) || "pending").toLowerCase();
  const orderStatus = (normalizeOptional(req.body.orderStatus) || "pending").toLowerCase();
  const notes = normalizeOptional(req.body.notes) || "";
  const addressSnapshot = asObject(req.body.addressSnapshot);
  const placedAt = req.body.placedAt ? new Date(req.body.placedAt) : undefined;

  if (!orderNumber || !user) throw new AppError("orderNumber and user are required", 400);
  assertObjectId(user, "Invalid user id");
  await assertVenuesExist(items);
  if (![subTotal, discountTotal, taxTotal, grandTotal].every((v) => !Number.isNaN(v) && v >= 0)) {
    throw new AppError("Invalid order totals", 400);
  }
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) throw new AppError("Invalid paymentMethod", 400);
  if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) throw new AppError("Invalid paymentStatus", 400);
  if (!ALLOWED_ORDER_STATUSES.has(orderStatus)) throw new AppError("Invalid orderStatus", 400);
  if (placedAt && Number.isNaN(placedAt.getTime())) throw new AppError("Invalid placedAt", 400);

  const order = await VenueOrder.create({
    orderNumber,
    user,
    items,
    subTotal,
    discountTotal,
    taxTotal,
    grandTotal,
    paymentMethod,
    paymentStatus,
    orderStatus,
    notes,
    addressSnapshot,
    ...(placedAt ? { placedAt } : {}),
  });

  const fresh = await VenueOrder.findById(order._id)
    .populate("user", "name phone email")
    .populate("items.venue", "name address city basePrice thumbnail")
    .lean();
  res.status(201).json({ message: "Venue order created", order: fresh });
});

exports.updateOrder = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const order = await VenueOrder.findById(req.params.id);
  if (!order) throw new AppError("Venue order not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "orderStatus")) {
    const orderStatus = normalizeRequired(req.body.orderStatus).toLowerCase();
    if (!ALLOWED_ORDER_STATUSES.has(orderStatus)) throw new AppError("Invalid orderStatus", 400);
    order.orderStatus = orderStatus;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "paymentStatus")) {
    const paymentStatus = normalizeRequired(req.body.paymentStatus).toLowerCase();
    if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) throw new AppError("Invalid paymentStatus", 400);
    order.paymentStatus = paymentStatus;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "paymentMethod")) {
    const paymentMethod = normalizeRequired(req.body.paymentMethod).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) throw new AppError("Invalid paymentMethod", 400);
    order.paymentMethod = paymentMethod;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "notes")) order.notes = normalizeOptional(req.body.notes) || "";
  if (Object.prototype.hasOwnProperty.call(req.body, "addressSnapshot")) {
    order.addressSnapshot = asObject(req.body.addressSnapshot);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "items")) {
    const items = normalizeItems(asItems(req.body.items));
    await assertVenuesExist(items);
    order.items = items;
  }

  const numericFields = ["subTotal", "discountTotal", "taxTotal", "grandTotal"];
  for (const field of numericFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const value = Number(req.body[field]);
      if (Number.isNaN(value) || value < 0) throw new AppError(`Invalid ${field}`, 400);
      order[field] = value;
    }
  }

  await order.save();
  const fresh = await VenueOrder.findById(order._id)
    .populate("user", "name phone email")
    .populate("items.venue", "name address city basePrice thumbnail")
    .lean();
  res.json({ message: "Venue order updated", order: fresh });
});

exports.deleteOrder = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const order = await VenueOrder.findByIdAndDelete(req.params.id).select("_id").lean();
  if (!order) throw new AppError("Venue order not found", 404);
  res.json({ message: "Venue order deleted" });
});
