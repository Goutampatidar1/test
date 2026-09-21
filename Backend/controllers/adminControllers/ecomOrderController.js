const Order = require("../../models/other/order");
const Product = require("../../models/other/product");
const Vendor = require("../../models/entity/vendor");
const User = require("../../models/entity/user");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, orderSearchFilter, applyOrderDateRangeFilter } = require("../../utils/listQuery");
const { buildVendorFulfillmentsFromItems } = require("../../utils/ecomVendorFulfillment");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { attachInvoiceUrls } = require("../../utils/ecomInvoiceUrls");
const { sendInvoiceResponse, getAdminOrderInvoice } = require("../../utils/ecomInvoiceResponse");
const { queueOrderStatusUpdatedNotification } = require("../../utils/ecomOrderNotifications");
const {
  isAdminFulfilledOrder,
  resolveAdminFulfillmentActions,
  updateAdminFulfilledOrderStatus,
} = require("../../utils/ecomAdminOrder");
const {
  listAssignableDriversForOrder,
  assignDriverToOrder,
  resolveOrderSubDistrict,
  enrichOrderLocation,
  toAdminDriverDeliveryPayload,
} = require("../../utils/adminOrderDriver");
const { getDeliveryOtpForOrder, toAdminDeliveryOtpPayload } = require("../../utils/deliveryOrderOtp");
const { buildVendorOrdersFilter } = require("../../utils/ecomVendorOrder");

function mergeMongoFilters(...parts) {
  const active = parts.filter((part) => part && Object.keys(part).length > 0);
  if (!active.length) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
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
const ALLOWED_PAYMENT_STATUSES = new Set(["pending", "paid", "failed", "refunded", "partially_refunded"]);
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

function asItems(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError("items must be a non-empty array", 400);
  }
  return value;
}

async function assertProductsExist(items) {
  const productIds = [...new Set(items.map((item) => String(item.product || "")).filter(Boolean))];
  for (const productId of productIds) assertObjectId(productId, "Invalid product id in items");
  const products = await Product.find({ _id: { $in: productIds } }).select("_id role addedById").lean();
  if (products.length !== productIds.length) {
    throw new AppError("One or more products do not exist", 404);
  }
  return new Map(products.map((product) => [String(product._id), product]));
}

function normalizeItems(items, productMap = new Map()) {
  return items.map((item) => {
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unitPrice ?? 0);
    const discountValue = Number(item.discountValue ?? 0);
    const taxValue = Number(item.taxValue ?? 0);
    const totalPrice = Number(item.totalPrice ?? 0);
    const productId = normalizeRequired(item.product);
    const product = productMap.get(productId);

    if (Number.isNaN(quantity) || quantity < 1) throw new AppError("Invalid item quantity", 400);
    if (Number.isNaN(unitPrice) || unitPrice < 0) throw new AppError("Invalid item unitPrice", 400);
    if (Number.isNaN(discountValue) || discountValue < 0) throw new AppError("Invalid item discountValue", 400);
    if (Number.isNaN(taxValue) || taxValue < 0) throw new AppError("Invalid item taxValue", 400);
    if (Number.isNaN(totalPrice) || totalPrice < 0) throw new AppError("Invalid item totalPrice", 400);

    return {
      product: productId,
      name: normalizeRequired(item.name),
      sku: normalizeOptional(item.sku) || "",
      quantity,
      unitPrice,
      discountValue,
      taxValue,
      totalPrice,
      ...(product?.role === "Vendor" && product.addedById ? { vendor: product.addedById } : {}),
    };
  });
}

function applyMutableFields(order, body) {
  if (Object.prototype.hasOwnProperty.call(body, "orderStatus")) {
    const orderStatus = normalizeRequired(body.orderStatus).toLowerCase();
    if (!ALLOWED_ORDER_STATUSES.has(orderStatus)) throw new AppError("Invalid orderStatus", 400);
    order.orderStatus = orderStatus;
  }
  if (Object.prototype.hasOwnProperty.call(body, "paymentStatus")) {
    const paymentStatus = normalizeRequired(body.paymentStatus).toLowerCase();
    if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) throw new AppError("Invalid paymentStatus", 400);
    order.paymentStatus = paymentStatus;
  }
  if (Object.prototype.hasOwnProperty.call(body, "paymentMethod")) {
    const paymentMethod = normalizeRequired(body.paymentMethod).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) throw new AppError("Invalid paymentMethod", 400);
    order.paymentMethod = paymentMethod;
  }
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    order.notes = normalizeOptional(body.notes) || "";
  }
  if (Object.prototype.hasOwnProperty.call(body, "addressSnapshot")) {
    order.addressSnapshot = asObject(body.addressSnapshot);
  }
}

function toAdminVendorSummary(vendor) {
  if (!vendor || typeof vendor !== "object") return null;
  return {
    _id: vendor._id,
    name: vendor.businessName || vendor.name || "",
    contactName: vendor.name || "",
    email: vendor.email || "",
    phone: vendor.businessPhone || vendor.phone || "",
    status: vendor.status || "",
    approvalStatus: vendor.approvalStatus || "",
  };
}

async function resolveOrderVendors(order) {
  const vendorIds = new Set();

  for (const item of order.items ?? []) {
    const vendorRef = item.vendor?._id || item.vendor;
    if (vendorRef) vendorIds.add(String(vendorRef));
  }

  for (const row of order.vendorFulfillments ?? []) {
    const vendorRef = row.vendor?._id || row.vendor;
    if (vendorRef) vendorIds.add(String(vendorRef));
  }

  const productIds = [
    ...new Set(
      (order.items ?? [])
        .map((item) => item.product?._id || item.product)
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ];

  if (productIds.length) {
    const products = await Product.find({
      _id: { $in: productIds },
      role: "Vendor",
      addedById: { $ne: null },
    })
      .select("addedById")
      .lean();
    for (const product of products) {
      if (product.addedById) vendorIds.add(String(product.addedById));
    }
  }

  if (!vendorIds.size) return [];

  const vendors = await Vendor.find({ _id: { $in: [...vendorIds] } })
    .select("name businessName email phone businessPhone status approvalStatus")
    .lean();

  return vendors.map(toAdminVendorSummary).filter(Boolean);
}

async function loadAdminOrderDetail(req, orderId) {
  const order = await Order.findById(orderId)
    .populate("user", "name phone email city subDistrict subDistrictId")
    .populate("deliveryBoy", "name phone email profileImage subDistrict subDistrictId city status approvalStatus")
    .populate("driverDelivery.rejectedBy", "name phone email subDistrict city status approvalStatus")
    .populate("items.product", "name sku price thumbnail role addedById")
    .populate("items.vendor", "name businessName email phone businessPhone status approvalStatus")
    .lean();
  if (!order) throw new AppError("Order not found", 404);

  const baseUrl = getPublicBaseUrl(req);
  const [withInvoice] = attachInvoiceUrls([order], baseUrl);
  const location = await enrichOrderLocation(await resolveOrderSubDistrict(withInvoice));
  const deliveryOtpRecord = await getDeliveryOtpForOrder(withInvoice._id);
  const vendors = await resolveOrderVendors(withInvoice);
  const isAdminFulfilled = isAdminFulfilledOrder({ ...withInvoice, vendors });

  return {
    ...withInvoice,
    vendors,
    isAdminFulfilled,
    adminFulfillment: isAdminFulfilled ? resolveAdminFulfillmentActions(withInvoice) : null,
    deliveryLocation: location,
    deliveryBoyAssignedBy: withInvoice.deliveryBoyAssignedBy || null,
    assignedDriver:
      withInvoice.deliveryBoyAssignedBy === "admin" && withInvoice.deliveryBoy
        ? withInvoice.deliveryBoy
        : null,
    driverDelivery: toAdminDriverDeliveryPayload(withInvoice),
    deliveryOtp: toAdminDeliveryOtpPayload(deliveryOtpRecord),
  };
}

exports.listOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { userId, vendorId, orderStatus, paymentStatus, paymentMethod, search } = req.query;

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
  if (vendorId) {
    assertObjectId(vendorId, "Invalid vendorId filter");
    filterParts.push(await buildVendorOrdersFilter(vendorId));
  }

  const searchOr = await orderSearchFilter(search, User);
  if (searchOr) filterParts.push(searchOr);

  const dateFilter = {};
  applyOrderDateRangeFilter(dateFilter, req.query);
  if (Object.keys(dateFilter).length) filterParts.push(dateFilter);

  const filter = mergeMongoFilters(...filterParts);

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("user", "name phone email")
      .populate("items.product", "name sku price thumbnail")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  const baseUrl = getPublicBaseUrl(req);

  res.json({
    orders: attachInvoiceUrls(orders, baseUrl),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getOrderById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const order = await loadAdminOrderDetail(req, req.params.id);
  res.json({ order });
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const nextStatus = req.body?.status ?? req.body?.orderStatus;
  const reason = req.body?.reason ?? req.body?.rejectionReason ?? req.body?.cancellationReason;
  await updateAdminFulfilledOrderStatus(req.params.id, nextStatus, { reason });
  const order = await loadAdminOrderDetail(req, req.params.id);
  res.json({ message: "Order status updated", order });
});

exports.getOrderInvoice = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const baseUrl = getPublicBaseUrl(req);
  const invoice = await getAdminOrderInvoice(req.params.id, baseUrl);
  return sendInvoiceResponse(req, res, invoice);
});

exports.createOrder = asyncHandler(async (req, res) => {
  const orderNumber = normalizeRequired(req.body.orderNumber);
  const user = normalizeRequired(req.body.user);
  const rawItems = asItems(req.body.items);
  const subTotal = Number(req.body.subTotal ?? 0);
  const discountTotal = Number(req.body.discountTotal ?? 0);
  const taxTotal = Number(req.body.taxTotal ?? 0);
  const shippingCharge = Number(req.body.shippingCharge ?? 0);
  const grandTotal = Number(req.body.grandTotal ?? 0);
  const paymentMethod = (normalizeOptional(req.body.paymentMethod) || "cod").toLowerCase();
  const paymentStatus = (normalizeOptional(req.body.paymentStatus) || "pending").toLowerCase();
  const orderStatus = (normalizeOptional(req.body.orderStatus) || "pending").toLowerCase();
  const notes = normalizeOptional(req.body.notes) || "";
  const addressSnapshot = asObject(req.body.addressSnapshot);
  const placedAt = req.body.placedAt ? new Date(req.body.placedAt) : undefined;

  if (!orderNumber || !user) throw new AppError("orderNumber and user are required", 400);
  assertObjectId(user, "Invalid user id");
  const productMap = await assertProductsExist(rawItems);
  const items = normalizeItems(rawItems, productMap);
  if (![subTotal, discountTotal, taxTotal, shippingCharge, grandTotal].every((v) => !Number.isNaN(v) && v >= 0)) {
    throw new AppError("Invalid order totals", 400);
  }
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) throw new AppError("Invalid paymentMethod", 400);
  if (!ALLOWED_PAYMENT_STATUSES.has(paymentStatus)) throw new AppError("Invalid paymentStatus", 400);
  if (!ALLOWED_ORDER_STATUSES.has(orderStatus)) throw new AppError("Invalid orderStatus", 400);
  if (placedAt && Number.isNaN(placedAt.getTime())) throw new AppError("Invalid placedAt", 400);

  const order = await Order.create({
    orderNumber,
    user,
    items,
    vendorFulfillments: await buildVendorFulfillmentsFromItems(items, { orderStatus }),
    subTotal,
    discountTotal,
    taxTotal,
    shippingCharge,
    grandTotal,
    paymentMethod,
    paymentStatus,
    orderStatus,
    notes,
    addressSnapshot,
    ...(placedAt ? { placedAt } : {}),
  });

  const fresh = await Order.findById(order._id)
    .populate("user", "name phone email")
    .populate("items.product", "name sku price thumbnail")
    .lean();
  res.status(201).json({ message: "Order created", order: fresh });
});

exports.updateOrder = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError("Order not found", 404);

  const previousOrderStatus = order.orderStatus;
  applyMutableFields(order, req.body);

  if (Object.prototype.hasOwnProperty.call(req.body, "items")) {
    const rawItems = asItems(req.body.items);
    const productMap = await assertProductsExist(rawItems);
    order.items = normalizeItems(rawItems, productMap);
  }

  const numericFields = ["subTotal", "discountTotal", "taxTotal", "shippingCharge", "grandTotal"];
  for (const field of numericFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const value = Number(req.body[field]);
      if (Number.isNaN(value) || value < 0) throw new AppError(`Invalid ${field}`, 400);
      order[field] = value;
    }
  }

  await order.save();

  if (
    Object.prototype.hasOwnProperty.call(req.body, "orderStatus") &&
    String(previousOrderStatus || "").toLowerCase() !== String(order.orderStatus || "").toLowerCase()
  ) {
    queueOrderStatusUpdatedNotification(order.toObject(), {
      previousStatus: previousOrderStatus,
      newStatus: order.orderStatus,
      source: "admin",
    });
  }

  const fresh = await Order.findById(order._id)
    .populate("user", "name phone email")
    .populate("items.product", "name sku price thumbnail")
    .lean();
  res.json({ message: "Order updated", order: fresh });
});

exports.deleteOrder = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const order = await Order.findByIdAndDelete(req.params.id).select("_id").lean();
  if (!order) throw new AppError("Order not found", 404);
  res.json({ message: "Order deleted" });
});

exports.listAssignableDrivers = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Order id");
  const result = await listAssignableDriversForOrder(req.params.id);
  res.json(result);
});

exports.assignDriver = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Order id");
  const deliveryBoyId = req.body?.deliveryBoyId ?? req.body?.deliveryBoy ?? req.body?.driverId;
  if (!deliveryBoyId) {
    throw new AppError("deliveryBoyId is required", 400);
  }
  assertObjectId(deliveryBoyId, "Invalid deliveryBoyId");

  const result = await assignDriverToOrder(req.params.id, deliveryBoyId);
  res.json({
    message: "Driver assigned to order",
    ...result,
  });
});
