const mongoose = require("mongoose");
const Order = require("../models/other/order");
const Product = require("../models/other/product");
const User = require("../models/entity/user");
const DeliveryBoy = require("../models/entity/deliveryboy");
const { AppConfig } = require("../models");
const AppError = require("./AppError");
const { formatInrAmount } = require("./publicProductList");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { formatDateOnly } = require("./dateOnly");
const { restoreProductStock } = require("./ecomCheckout");
const { cancelEcomTransactionForOrder } = require("./ecomTransaction");
const { resolveInvoiceUrls } = require("./ecomInvoiceUrls");
const { queueOrderStatusUpdatedNotification } = require("./ecomOrderNotifications");
const { initDriverDeliveryPending, syncDriverDeliveryFromVendorStatus } = require("./deliveryDriverOrder");
const { getUserRatingsForProducts } = require("./productRating");
const {
  getVendorFulfillment,
  resolveVendorFulfillmentStatus,
  syncAggregateOrderStatus,
  ensureVendorFulfillmentsPersisted,
  vendorFulfillmentMatchesTab,
} = require("./ecomVendorFulfillment");

const PAYMENT_METHOD_LABELS = {
  cod: "Cash On Delivery",
  online: "Online Payment",
  wallet: "Wallet",
};

const VENDOR_STATUS_TABS = {
  new: ["pending"],
  accepted: ["confirmed", "processing"],
  out_for_delivery: ["shipped"],
  completed: ["delivered"],
  cancelled: ["cancelled", "refunded"],
};

const VENDOR_STATUS_DISPLAY = {
  pending: { key: "new", label: "NEW", tone: "blue" },
  confirmed: { key: "accepted", label: "PROCESSING", tone: "purple" },
  processing: { key: "accepted", label: "PROCESSING", tone: "purple" },
  shipped: { key: "out_for_delivery", label: "DISPATCHED", tone: "orange" },
  delivered: { key: "completed", label: "COMPLETED", tone: "green" },
  cancelled: { key: "cancelled", label: "CANCELLED", tone: "red" },
  refunded: { key: "cancelled", label: "CANCELLED", tone: "grey" },
};

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function formatShortOrderDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatOrderDisplayId(order) {
  const orderNumber = String(order.orderNumber || "").trim();
  if (orderNumber) return `#${orderNumber}`;
  const raw = String(order._id || "");
  return `#ORD-${raw.slice(-7).toUpperCase()}`;
}

function normalizeStatusTab(value) {
  if (!value) return null;
  const tab = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    new_order: "new",
    new_orders: "new",
    accept: "accepted",
    accepted: "accepted",
    accepted_orders: "accepted",
    processing: "accepted",
    processing_orders: "accepted",
    out_for_delivery: "out_for_delivery",
    outfordelivery: "out_for_delivery",
    dispatched: "out_for_delivery",
    complete: "completed",
    completed: "completed",
    completed_orders: "completed",
    cancel: "cancelled",
    cancelled_orders: "cancelled",
  };
  const normalized = aliases[tab] || tab;
  return VENDOR_STATUS_TABS[normalized] ? normalized : null;
}

function resolveVendorStatusDisplay(orderStatus) {
  const key = String(orderStatus || "pending").toLowerCase();
  return (
    VENDOR_STATUS_DISPLAY[key] ?? {
      key,
      label: key.toUpperCase(),
      tone: "grey",
    }
  );
}

function orderStatusesForTab(statusTab) {
  const normalized = normalizeStatusTab(statusTab);
  if (!normalized) return null;
  return VENDOR_STATUS_TABS[normalized];
}

async function getVendorProductIdSet(vendorId) {
  const products = await Product.find({
    addedById: toObjectId(vendorId),
    role: { $ne: "VenueVendor" },
  })
    .select("_id")
    .lean();

  return new Set(products.map((product) => String(product._id)));
}

function itemBelongsToVendor(item, vendorId, productIdSet) {
  const vid = String(vendorId);
  if (item?.vendor && String(item.vendor) === vid) return true;
  return productIdSet.has(String(item.product));
}

function filterVendorItems(order, productIdSet, vendorId) {
  return (order.items ?? []).filter((item) =>
    itemBelongsToVendor(item, vendorId, productIdSet)
  );
}

function orderHasVendorItems(order, productIdSet, vendorId) {
  return filterVendorItems(order, productIdSet, vendorId).length > 0;
}

function orderOwnedEntirelyByVendor(order, productIdSet, vendorId) {
  const items = order.items ?? [];
  return items.length > 0 && items.every((item) => itemBelongsToVendor(item, vendorId, productIdSet));
}

function sumItemTotals(items) {
  return items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
}

function sumItemQuantities(items) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

function computeVendorShippingShare(order, vendorSubTotal) {
  const orderSub = Number(order.subTotal) || 0;
  if (orderSub <= 0 || vendorSubTotal <= 0) return 0;
  const ratio = vendorSubTotal / orderSub;
  return Math.round(Number(order.shippingCharge || 0) * ratio * 100) / 100;
}

async function getVendorCommissionPercent() {
  const config = await AppConfig.findOne().select("commissions").lean();
  const row = (config?.commissions ?? []).find((entry) => entry.type === "Vendor");
  return Number(row?.percentage) || 0;
}

function isEarningEligible(order) {
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  if (orderStatus !== "delivered") return false;

  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  const paymentMethod = String(order.paymentMethod || "").toLowerCase();
  return paymentStatus === "paid" || paymentMethod === "cod";
}

function isVendorFulfillmentEarningEligible(order) {
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  const paymentMethod = String(order.paymentMethod || "").toLowerCase();
  if (paymentStatus === "paid") return true;
  if (paymentMethod === "cod" && String(order.orderStatus || "").toLowerCase() === "delivered") {
    return true;
  }
  return false;
}

function formatProductTitle(items) {
  if (!items.length) return "";
  const firstName = items[0].name || "Product";
  if (items.length === 1) return firstName;
  return `${firstName} +${items.length - 1} more`;
}

function buildAddressSection(order) {
  const snap =
    order.addressSnapshot && typeof order.addressSnapshot === "object"
      ? order.addressSnapshot
      : {};

  const fullName = snap.fullName || snap.name || "";
  const pincode = snap.pincode || "";
  const label = snap.label || "home";
  const labelDisplay =
    snap.labelDisplay ||
    (label === "home" ? "Home" : label === "office" ? "Office" : "Other");
  const addressLine =
    snap.fullAddress ||
    snap.addressLine ||
    [snap.houseNo, snap.buildingName, snap.roadName, snap.areaColony, snap.landmark, snap.city, snap.state, snap.pincode]
      .filter(Boolean)
      .join(", ");

  return {
    fullName,
    pincode,
    label,
    labelDisplay,
    phone: snap.phone || snap.mobileNumber || "",
    addressLine,
    fullAddress: addressLine,
    title: fullName && pincode ? `${fullName}, ${pincode}` : fullName || pincode,
  };
}

function buildCustomerDetail(user, baseUrl) {
  if (!user) {
    return {
      userId: null,
      name: "",
      phone: "",
      profileImage: "",
    };
  }

  return {
    userId: user._id,
    name: user.name || "",
    phone: user.phone || "",
    profileImage: user.profileImage ? toAbsoluteUploadUrl(user.profileImage, baseUrl) : "",
  };
}

async function loadVendorOrderCustomerReviews(order, vendorItems, user, productMap, baseUrl) {
  if (!order?.user || !vendorItems?.length) return [];

  const productIds = [
    ...new Set(vendorItems.map((item) => item.product).filter(Boolean).map((id) => String(id))),
  ];
  if (!productIds.length) return [];

  const ratingMap = await getUserRatingsForProducts(order.user, productIds);
  if (!ratingMap.size) return [];

  const seenProductIds = new Set();
  const reviews = [];

  for (const item of vendorItems) {
    const productId = String(item.product);
    if (!productId || seenProductIds.has(productId)) continue;

    const rating = ratingMap.get(productId);
    if (!rating) continue;

    seenProductIds.add(productId);
    reviews.push({
      _id: rating._id,
      productId: item.product,
      productName: item.name || "",
      rating: rating.rating,
      review: rating.review ?? "",
      name: user?.name || "",
      profileImage: user?.profileImage ? toAbsoluteUploadUrl(user.profileImage, baseUrl) : "",
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
    });
  }

  return reviews;
}

function buildVendorPaymentDetail(order, vendorItems, commissionPercent) {
  const subTotal = sumItemTotals(vendorItems);
  const shippingCost = computeVendorShippingShare(order, subTotal);
  const grossTotal = Math.round((subTotal + shippingCost) * 100) / 100;
  const commissionAmount = Math.round((subTotal * commissionPercent) / 100 * 100) / 100;
  const netTotal = Math.round((grossTotal - commissionAmount) * 100) / 100;

  return {
    subTotal,
    subTotalLabel: formatInrAmount(subTotal),
    shippingCost,
    shippingCostLabel: formatInrAmount(shippingCost),
    adminCommissionPercent: commissionPercent,
    adminCommissionLabel: commissionPercent > 0 ? `-${commissionPercent}%` : "0%",
    adminCommissionAmount: commissionAmount,
    adminCommissionAmountLabel: commissionAmount > 0 ? `-${formatInrAmount(commissionAmount)}` : formatInrAmount(0),
    total: grossTotal,
    totalLabel: formatInrAmount(grossTotal),
    vendorEarnings: netTotal,
    vendorEarningsLabel: formatInrAmount(netTotal),
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
}

function buildVendorOrderItems(vendorItems, productMap, baseUrl) {
  return vendorItems.map((item) => {
    const product = productMap.get(String(item.product));
    return {
      productId: item.product,
      productName: item.name,
      sku: item.sku,
      variantSku: item.variantSku || "",
      quantity: item.quantity,
      quantityLabel: `Qty - ${item.quantity}`,
      unitPrice: item.unitPrice,
      unitPriceLabel: formatInrAmount(item.unitPrice),
      totalPrice: item.totalPrice,
      totalPriceLabel: formatInrAmount(item.totalPrice),
      thumbnail: product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, baseUrl) : "",
    };
  });
}

function resolveVendorOrderActions(order, vendorId, vendorFulfillment, ownsEntireOrder) {
  const orderStatus = String(order.orderStatus || "pending").toLowerCase();
  const vendorStatus = vendorFulfillment
    ? String(vendorFulfillment.status || "pending").toLowerCase()
    : resolveVendorFulfillmentStatus(order, vendorId);
  const orderCancelled = orderStatus === "cancelled" || orderStatus === "refunded";
  const hasAssignedDriver = Boolean(order.deliveryBoy || vendorFulfillment?.deliveryBoy);

  const canAccept = !orderCancelled && vendorStatus === "pending";
  const canReject = !orderCancelled && vendorStatus === "pending";
  const canMarkOutForDelivery =
    !orderCancelled && ["confirmed", "processing"].includes(vendorStatus);
  const canMarkDelivered =
    !orderCancelled && vendorStatus === "shipped" && !hasAssignedDriver;

  const actions = {
    canAccept,
    canReject,
    canMarkOutForDelivery,
    canMarkDelivered,
    ownsEntireOrder,
    multiVendorOrder: !ownsEntireOrder,
    vendorOrderStatus: vendorStatus,
  };

  if (canAccept) {
    actions.primaryAction = { key: "accept", label: "Accept" };
    actions.secondaryAction = { key: "reject", label: "Reject" };
  } else if (canMarkOutForDelivery) {
    actions.primaryAction = { key: "out_for_delivery", label: "Out For Delivery" };
  } else if (canMarkDelivered) {
    actions.primaryAction = { key: "delivered", label: "Mark Delivered" };
  }

  return actions;
}

function formatDeliveryCountLabel(count) {
  const total = Number(count) || 0;
  if (total >= 2000) return "2k+ deliveries";
  if (total >= 1000) return `${Math.floor(total / 1000)}k+ deliveries`;
  return `${total} deliveries`;
}

function formatDriverPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return phone;
}

function buildDriverDetail(driver, deliveryCount, baseUrl) {
  if (!driver) {
    return {
      driverId: null,
      name: "",
      phone: "",
      profileImage: "",
      rating: null,
      deliveryCount: 0,
      deliveryCountLabel: "",
      canCall: false,
    };
  }

  const count = Number(deliveryCount) || 0;

  return {
    driverId: driver._id,
    name: driver.name || "",
    phone: formatDriverPhone(driver.phone),
    profileImage: driver.profileImage ? toAbsoluteUploadUrl(driver.profileImage, baseUrl) : "",
    rating: null,
    ratingLabel: null,
    deliveryCount: count,
    deliveryCountLabel: formatDeliveryCountLabel(count),
    canCall: Boolean(driver.phone),
  };
}

function isDriverDeliveryAccepted(order) {
  const status = String(order?.driverDelivery?.status || "").toLowerCase();
  return ["accepted", "processing", "out_for_delivery", "delivered"].includes(status);
}

async function loadDriverDeliveryCounts(driverIds) {
  if (!driverIds.length) return new Map();

  const rows = await Order.aggregate([
    {
      $match: {
        deliveryBoy: { $in: driverIds.map((id) => toObjectId(id)) },
        orderStatus: "delivered",
      },
    },
    {
      $group: {
        _id: "$deliveryBoy",
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function pickAvailableDeliveryBoy() {
  return DeliveryBoy.findOne({
    status: "active",
    approvalStatus: "approved",
  })
    .select("_id name phone profileImage")
    .sort({ createdAt: 1 })
    .lean();
}

async function assignDeliveryBoyToFulfillment(fulfillment) {
  if (!fulfillment || fulfillment.deliveryBoy) return fulfillment?.deliveryBoy ?? null;
  const driver = await pickAvailableDeliveryBoy();
  if (!driver?._id) return null;
  fulfillment.deliveryBoy = driver._id;
  return driver._id;
}

async function assignDeliveryBoyIfMissing(orderId, vendorId = null) {
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) return null;

  await ensureVendorFulfillmentsPersisted(orderDoc);

  if (vendorId) {
    const fulfillment = getVendorFulfillment(orderDoc, vendorId);
    if (!fulfillment) return null;
    await assignDeliveryBoyToFulfillment(fulfillment);
    if (orderDoc.vendorFulfillments.length === 1) {
      orderDoc.deliveryBoy = fulfillment.deliveryBoy;
    }
    await orderDoc.save();
    return fulfillment.deliveryBoy;
  }

  if (orderDoc.deliveryBoy) return orderDoc.deliveryBoy;

  const driver = await pickAvailableDeliveryBoy();
  if (!driver?._id) return null;

  orderDoc.deliveryBoy = driver._id;
  for (const fulfillment of orderDoc.vendorFulfillments ?? []) {
    if (!fulfillment.deliveryBoy) fulfillment.deliveryBoy = driver._id;
  }
  await orderDoc.save();
  return driver._id;
}

async function hydrateVendorOrderContext(vendorId, orders, baseUrl) {
  const productIdSet = await getVendorProductIdSet(vendorId);
  const productIds = [
    ...new Set(
      orders
        .flatMap((order) => (order.items ?? []).map((item) => String(item.product)))
        .filter(Boolean)
    ),
  ];

  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds.map((id) => toObjectId(id)) } })
        .select("_id thumbnail addedById")
        .lean()
    : [];

  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const userIds = [...new Set(orders.map((order) => String(order.user)).filter(Boolean))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds.map((id) => toObjectId(id)) } })
        .select("name phone profileImage")
        .lean()
    : [];
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const driverIds = [
    ...new Set(
      orders
        .flatMap((order) => {
          const ids = [];
          if (order.deliveryBoy) ids.push(String(order.deliveryBoy));
          for (const row of order.vendorFulfillments ?? []) {
            if (row.deliveryBoy) ids.push(String(row.deliveryBoy));
          }
          return ids;
        })
        .filter(Boolean)
    ),
  ];
  const drivers = driverIds.length
    ? await DeliveryBoy.find({ _id: { $in: driverIds.map((id) => toObjectId(id)) } })
        .select("name phone profileImage")
        .lean()
    : [];
  const driverMap = new Map(drivers.map((driver) => [String(driver._id), driver]));
  const driverDeliveryCounts = await loadDriverDeliveryCounts(driverIds);

  const commissionPercent = await getVendorCommissionPercent();

  return {
    vendorId: String(vendorId),
    productIdSet,
    productMap,
    userMap,
    driverMap,
    driverDeliveryCounts,
    commissionPercent,
    baseUrl,
  };
}

function toVendorOrderCard(order, context) {
  const vendorItems = filterVendorItems(order, context.productIdSet, context.vendorId);
  const primaryItem = vendorItems[0] ?? null;
  const product = primaryItem ? context.productMap.get(String(primaryItem.product)) : null;
  const ownsEntireOrder = orderOwnedEntirelyByVendor(
    order,
    context.productIdSet,
    context.vendorId
  );
  const vendorFulfillment = getVendorFulfillment(order, context.vendorId);
  const vendorStatus = resolveVendorFulfillmentStatus(order, context.vendorId);
  const status = resolveVendorStatusDisplay(vendorStatus);
  const placedAt = order.placedAt ?? order.createdAt;
  const vendorSubTotal = sumItemTotals(vendorItems);
  const user = context.userMap.get(String(order.user));
  const actions = resolveVendorOrderActions(
    order,
    context.vendorId,
    vendorFulfillment,
    ownsEntireOrder
  );
  const invoice = resolveInvoiceUrls(order, context.baseUrl);

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderDisplayId: formatOrderDisplayId(order),
    productId: primaryItem?.product ?? null,
    productName: formatProductTitle(vendorItems),
    thumbnail: product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, context.baseUrl) : "",
    itemCount: vendorItems.length,
    totalQuantity: sumItemQuantities(vendorItems),
    quantityLabel: `QTY: ${sumItemQuantities(vendorItems)}`,
    status: status.key,
    statusLabel: status.label,
    statusTone: status.tone,
    orderStatus: order.orderStatus,
    vendorOrderStatus: vendorStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerName: user?.name || "",
    customerImage: user?.profileImage ? toAbsoluteUploadUrl(user.profileImage, context.baseUrl) : "",
    totalAmount: vendorSubTotal,
    totalAmountLabel: formatInrAmount(vendorSubTotal),
    currency: "INR",
    symbol: "₹",
    placedAt,
    orderDate: formatShortOrderDate(placedAt),
    groupDate: formatDateOnly(placedAt),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    actions,
    invoice,
    invoicePdfUrl: invoice.invoicePdfUrl,
    invoiceUrl: invoice.vendorInvoiceUrl,
  };
}

function toVendorOrderDetail(order, context) {
  const vendorItems = filterVendorItems(order, context.productIdSet, context.vendorId);
  const user = context.userMap.get(String(order.user));
  const ownsEntireOrder = orderOwnedEntirelyByVendor(
    order,
    context.productIdSet,
    context.vendorId
  );
  const vendorFulfillment = getVendorFulfillment(order, context.vendorId);
  const vendorStatus = resolveVendorFulfillmentStatus(order, context.vendorId);
  const status = resolveVendorStatusDisplay(vendorStatus);
  const placedAt = order.placedAt ?? order.createdAt;
  const actions = resolveVendorOrderActions(
    order,
    context.vendorId,
    vendorFulfillment,
    ownsEntireOrder
  );
  const paymentDetail = buildVendorPaymentDetail(order, vendorItems, context.commissionPercent);
  const driverId = vendorFulfillment?.deliveryBoy || order.deliveryBoy;
  const driverAccepted = isDriverDeliveryAccepted(order);
  const driver =
    driverAccepted && driverId ? context.driverMap.get(String(driverId)) : null;
  const driverDetail = buildDriverDetail(
    driver,
    driver ? context.driverDeliveryCounts.get(String(driverId)) ?? 0 : 0,
    context.baseUrl
  );
  const invoice = resolveInvoiceUrls(order, context.baseUrl);

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderDisplayId: formatOrderDisplayId(order),
    placedAt,
    orderDate: formatShortOrderDate(placedAt),
    orderStatus: order.orderStatus,
    vendorOrderStatus: vendorStatus,
    status: status.key,
    statusLabel: status.label,
    statusTone: status.tone,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
    shippingAddress: buildAddressSection(order),
    address: buildAddressSection(order),
    items: buildVendorOrderItems(vendorItems, context.productMap, context.baseUrl),
    customer: buildCustomerDetail(user, context.baseUrl),
    customerDetail: buildCustomerDetail(user, context.baseUrl),
    driver: driverDetail,
    driverDetail,
    paymentDetail,
    customerReviews: context.customerReviews ?? [],
    cancellationReason: order.cancellationReason || "",
    cancelledAt: order.cancelledAt ?? null,
    notes: order.notes || "",
    actions,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    invoice,
    invoicePdfUrl: invoice.invoicePdfUrl,
    invoiceUrl: invoice.vendorInvoiceUrl,
  };
}

async function buildVendorOrdersFilter(vendorId, productIdSet = null) {
  const vendorObjectId = toObjectId(vendorId);
  const ids = productIdSet ? [...productIdSet] : [];
  let productIds = ids;

  if (!productIds.length) {
    productIds = await Product.distinct("_id", {
      addedById: vendorObjectId,
      role: { $ne: "VenueVendor" },
    });
  }

  const conditions = [{ items: { $elemMatch: { vendor: vendorObjectId } } }];
  if (productIds.length) {
    conditions.push({
      "items.product": { $in: productIds.map((id) => toObjectId(id)) },
    });
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

async function findVendorOrders(vendorId, { statusTab = null, limit = null } = {}) {
  const productIdSet = await getVendorProductIdSet(vendorId);
  const filter = await buildVendorOrdersFilter(vendorId, productIdSet);

  let query = Order.find(filter).sort({ placedAt: -1, createdAt: -1 });
  if (limit) {
    query = query.limit(limit * 3);
  }

  let orders = await query.lean();
  const statuses = orderStatusesForTab(statusTab);

  const needsBackfill = orders.filter((order) => !order.vendorFulfillments?.length);
  if (needsBackfill.length) {
    await Promise.all(
      needsBackfill.map(async (order) => {
        const doc = await Order.findById(order._id);
        if (doc && !doc.vendorFulfillments?.length) {
          await ensureVendorFulfillmentsPersisted(doc);
        }
      })
    );
    orders = await Order.find({ _id: { $in: orders.map((order) => order._id) } })
      .sort({ placedAt: -1, createdAt: -1 })
      .lean();
  }

  if (statuses) {
    orders = orders.filter((order) =>
      vendorFulfillmentMatchesTab(order, vendorId, statuses)
    );
  }

  if (limit) {
    orders = orders.slice(0, limit);
  }

  return { orders, productIdSet };
}

function paginateRows(rows, page, limit) {
  const total = rows.length;
  const start = (page - 1) * limit;
  return {
    rows: rows.slice(start, start + limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}

async function listVendorOrders(vendorId, options = {}) {
  const { statusTab = null, page = 1, limit = 20, baseUrl = "" } = options;
  const { orders } = await findVendorOrders(vendorId, { statusTab });
  const context = await hydrateVendorOrderContext(vendorId, orders, baseUrl);
  const rows = orders
    .filter((order) => orderHasVendorItems(order, context.productIdSet, vendorId))
    .map((order) => toVendorOrderCard(order, context));

  const paginated = paginateRows(rows, page, limit);
  return {
    orders: paginated.rows,
    total: paginated.total,
    page: paginated.page,
    limit: paginated.limit,
    pages: paginated.pages,
  };
}

async function getVendorAverageRating(vendorId) {
  const [result] = await Product.aggregate([
    {
      $match: {
        addedById: toObjectId(vendorId),
        role: { $ne: "VenueVendor" },
        ratingCount: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$averageRating" },
        ratingCount: { $sum: "$ratingCount" },
      },
    },
  ]);

  if (!result?.ratingCount) {
    return { rating: null, ratingCount: 0 };
  }

  return {
    rating: Math.round(Number(result.averageRating) * 10) / 10,
    ratingCount: result.ratingCount,
  };
}

async function computeVendorHomeStats(vendorId, productIdSet) {
  const filter = await buildVendorOrdersFilter(vendorId, productIdSet);

  const orders = await Order.find(filter)
    .select("orderStatus paymentStatus paymentMethod items subTotal shippingCharge vendorFulfillments")
    .lean();

  const needsBackfill = orders.filter((order) => !order.vendorFulfillments?.length);
  if (needsBackfill.length) {
    await Promise.all(
      needsBackfill.map(async (order) => {
        const doc = await Order.findById(order._id);
        if (doc && !doc.vendorFulfillments?.length) {
          await ensureVendorFulfillmentsPersisted(doc);
        }
      })
    );
  }

  const refreshedOrders = needsBackfill.length
    ? await Order.find(filter)
        .select("orderStatus paymentStatus paymentMethod items subTotal shippingCharge vendorFulfillments")
        .lean()
    : orders;

  const commissionPercent = await getVendorCommissionPercent();
  let totalEarnings = 0;
  let totalOrders = 0;
  let pendingOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;

  for (const order of refreshedOrders) {
    if (!orderHasVendorItems(order, productIdSet, vendorId)) continue;

    const vendorStatus = resolveVendorFulfillmentStatus(order, vendorId);
    totalOrders += 1;

    if (vendorStatus === "pending") pendingOrders += 1;
    if (vendorStatus === "delivered") completedOrders += 1;
    if (vendorStatus === "cancelled") cancelledOrders += 1;

    if (vendorStatus === "delivered" && isEarningEligible(order)) {
      const vendorItems = filterVendorItems(order, productIdSet, vendorId);
      const paymentDetail = buildVendorPaymentDetail(order, vendorItems, commissionPercent);
      totalEarnings += paymentDetail.vendorEarnings;
    }
  }

  totalEarnings = Math.round(totalEarnings * 100) / 100;

  return {
    totalOrders,
    pendingOrders,
    completedOrders,
    cancelledOrders,
    totalEarnings,
    totalEarningsLabel: formatInrAmount(totalEarnings),
  };
}

async function getVendorHomeDashboard(vendorId, options = {}) {
  const { baseUrl = "", newOrdersLimit = 5 } = options;
  const productIdSet = await getVendorProductIdSet(vendorId);
  const Vendor = require("../models/entity/vendor");
  const [stats, ratingInfo, recentResult, vendorDoc] = await Promise.all([
    computeVendorHomeStats(vendorId, productIdSet),
    getVendorAverageRating(vendorId),
    findVendorOrders(vendorId, { statusTab: "new", limit: newOrdersLimit }),
    Vendor.findById(vendorId).select("isOpen").lean(),
  ]);

  const context = await hydrateVendorOrderContext(vendorId, recentResult.orders, baseUrl);
  const newOrders = recentResult.orders
    .filter((order) => orderHasVendorItems(order, context.productIdSet, vendorId))
    .map((order) => toVendorOrderCard(order, context));

  const isOpen = vendorDoc?.isOpen !== false;

  return {
    totalEarnings: stats.totalEarnings,
    totalEarningsLabel: stats.totalEarningsLabel,
    rating: ratingInfo.rating,
    ratingCount: ratingInfo.ratingCount,
    isOpen,
    statusLabel: isOpen ? "open" : "closed",
    stats: {
      totalOrders: stats.totalOrders,
      pendingOrders: stats.pendingOrders,
      completedOrders: stats.completedOrders,
      cancelledOrders: stats.cancelledOrders,
    },
    newOrders,
  };
}

async function loadVendorOrder(vendorId, orderId) {
  const productIdSet = await getVendorProductIdSet(vendorId);
  const orderDoc = await Order.findById(toObjectId(orderId));

  if (!orderDoc) {
    throw new AppError("Order not found", 404);
  }

  await ensureVendorFulfillmentsPersisted(orderDoc);
  const order = orderDoc.toObject();

  if (!orderHasVendorItems(order, productIdSet, vendorId)) {
    throw new AppError("Order not found", 404);
  }

  return { order, productIdSet, orderDoc };
}

async function getVendorOrderDetail(vendorId, orderId, baseUrl) {
  const { order } = await loadVendorOrder(vendorId, orderId);
  const context = await hydrateVendorOrderContext(vendorId, [order], baseUrl);
  const vendorItems = filterVendorItems(order, context.productIdSet, context.vendorId);
  const user = context.userMap.get(String(order.user));
  context.customerReviews = await loadVendorOrderCustomerReviews(
    order,
    vendorItems,
    user,
    context.productMap,
    baseUrl
  );
  return toVendorOrderDetail(order, context);
}

async function acceptVendorOrder(vendorId, orderId) {
  const { orderDoc } = await loadVendorOrder(vendorId, orderId);
  const vid = String(vendorId);
  const fulfillment = getVendorFulfillment(orderDoc, vid);

  if (!fulfillment) {
    throw new AppError("Order not found", 404);
  }

  if (String(fulfillment.status || "pending").toLowerCase() !== "pending") {
    throw new AppError("Only new orders can be accepted", 400);
  }

  const orderStatus = String(orderDoc.orderStatus || "pending").toLowerCase();
  if (orderStatus === "cancelled" || orderStatus === "refunded") {
    throw new AppError("This order is no longer available", 400);
  }

  const previousStatus = orderDoc.orderStatus;
  fulfillment.status = "confirmed";
  fulfillment.acceptedAt = new Date();

  if (orderDoc.deliveryBoy && !fulfillment.deliveryBoy) {
    fulfillment.deliveryBoy = orderDoc.deliveryBoy;
  }

  if ((orderDoc.vendorFulfillments ?? []).length === 1) {
    if (!fulfillment.deliveryBoy && orderDoc.deliveryBoy) {
      fulfillment.deliveryBoy = orderDoc.deliveryBoy;
    }
    orderDoc.deliveryBoy = fulfillment.deliveryBoy || orderDoc.deliveryBoy;
  }

  if (orderDoc.deliveryBoy) {
    initDriverDeliveryPending(orderDoc);
  }

  orderDoc.orderStatus = syncAggregateOrderStatus(orderDoc.vendorFulfillments);

  await orderDoc.save();
  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "vendor",
  });
  return orderDoc.toObject();
}

async function rejectVendorOrder(vendorId, orderId, reason) {
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) {
    throw new AppError("Rejection reason is required", 400);
  }

  const { orderDoc } = await loadVendorOrder(vendorId, orderId);
  const vid = String(vendorId);
  const fulfillment = getVendorFulfillment(orderDoc, vid);

  if (!fulfillment) {
    throw new AppError("Order not found", 404);
  }

  if (String(fulfillment.status || "pending").toLowerCase() !== "pending") {
    throw new AppError("Only new orders can be rejected", 400);
  }

  const now = new Date();
  const previousStatus = orderDoc.orderStatus;
  for (const row of orderDoc.vendorFulfillments ?? []) {
    row.status = "cancelled";
    row.rejectedAt = now;
    row.cancellationReason = normalizedReason;
  }

  for (const item of orderDoc.items ?? []) {
    await restoreProductStock({
      product: item.product,
      variantSku: item.variantSku || "",
      quantity: item.quantity,
      name: item.name,
    });
  }

  orderDoc.orderStatus = "cancelled";
  orderDoc.cancellationReason = normalizedReason;
  orderDoc.cancelledAt = now;
  if (String(orderDoc.paymentStatus || "").toLowerCase() === "pending") {
    orderDoc.paymentStatus = "failed";
  }

  await orderDoc.save();
  await cancelEcomTransactionForOrder(orderDoc, normalizedReason, { refunded: false });

  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "vendor",
  });

  return orderDoc.toObject();
}

async function updateVendorOrderStatus(vendorId, orderId, nextStatusRaw) {
  const normalized = String(nextStatusRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const statusAliases = {
    out_for_delivery: "shipped",
    outfordelivery: "shipped",
    dispatched: "shipped",
    complete: "delivered",
    completed: "delivered",
  };
  const nextStatus = statusAliases[normalized] || normalized;

  if (nextStatus === "processing") {
    const { orderDoc } = await loadVendorOrder(vendorId, orderId);
    const fulfillment = getVendorFulfillment(orderDoc, String(vendorId));
    if (!fulfillment) {
      throw new AppError("Order not found", 404);
    }
    const currentStatus = String(fulfillment.status || "pending").toLowerCase();
    if (currentStatus === "pending") {
      throw new AppError("Accept the order first", 400);
    }
    if (["confirmed", "processing"].includes(currentStatus)) {
      return orderDoc.toObject();
    }
    throw new AppError(`Cannot move order from ${currentStatus} to processing`, 400);
  }

  if (!["shipped", "delivered"].includes(nextStatus)) {
    throw new AppError(
      "Invalid order status. Use shipped, delivered, or out_for_delivery",
      400
    );
  }

  const { orderDoc } = await loadVendorOrder(vendorId, orderId);
  const vid = String(vendorId);
  const fulfillment = getVendorFulfillment(orderDoc, vid);

  if (!fulfillment) {
    throw new AppError("Order not found", 404);
  }

  const currentStatus = String(fulfillment.status || "pending").toLowerCase();

  const canShip = nextStatus === "shipped" && ["confirmed", "processing"].includes(currentStatus);
  const canDeliver = nextStatus === "delivered" && currentStatus === "shipped";

  if (!canShip && !canDeliver) {
    throw new AppError(`Cannot move order from ${currentStatus} to ${nextStatus}`, 400);
  }

  const hasAssignedDriver = Boolean(orderDoc.deliveryBoy || fulfillment.deliveryBoy);
  if (nextStatus === "delivered" && hasAssignedDriver) {
    throw new AppError("Assigned driver will mark this order as delivered", 400);
  }

  const previousStatus = orderDoc.orderStatus;
  fulfillment.status = nextStatus;
  if (nextStatus === "shipped") fulfillment.shippedAt = new Date();
  if (nextStatus === "delivered") fulfillment.deliveredAt = new Date();

  orderDoc.orderStatus = syncAggregateOrderStatus(orderDoc.vendorFulfillments);

  if (
    nextStatus === "delivered" &&
    String(orderDoc.paymentMethod || "").toLowerCase() === "cod" &&
    orderDoc.orderStatus === "delivered"
  ) {
    orderDoc.paymentStatus = "paid";
  }

  if ((orderDoc.vendorFulfillments ?? []).length === 1) {
    if (!fulfillment.deliveryBoy && orderDoc.deliveryBoy) {
      fulfillment.deliveryBoy = orderDoc.deliveryBoy;
    }
    orderDoc.deliveryBoy = fulfillment.deliveryBoy || orderDoc.deliveryBoy;
  }

  syncDriverDeliveryFromVendorStatus(orderDoc);

  await orderDoc.save();

  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "vendor",
  });
  return orderDoc.toObject();
}

async function markVendorOrderOutForDelivery(vendorId, orderId) {
  return updateVendorOrderStatus(vendorId, orderId, "shipped");
}

async function markVendorOrderProcessing(vendorId, orderId) {
  return updateVendorOrderStatus(vendorId, orderId, "processing");
}

module.exports = {
  normalizeStatusTab,
  orderStatusesForTab,
  buildVendorOrdersFilter,
  listVendorOrders,
  getVendorHomeDashboard,
  getVendorOrderDetail,
  acceptVendorOrder,
  rejectVendorOrder,
  updateVendorOrderStatus,
  markVendorOrderOutForDelivery,
  markVendorOrderProcessing,
  toVendorOrderCard,
  toVendorOrderDetail,
};
