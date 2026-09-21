const mongoose = require("mongoose");
const Order = require("../models/other/order");
const Product = require("../models/other/product");
const User = require("../models/entity/user");
const Vendor = require("../models/entity/vendor");
const DeliveryBoy = require("../models/entity/deliveryboy");
const AppError = require("./AppError");
const { formatInrAmount } = require("./publicProductList");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { formatDateOnly } = require("./dateOnly");
const { ensureVendorFulfillmentsPersisted } = require("./ecomVendorFulfillment");
const { queueOrderStatusUpdatedNotification } = require("./ecomOrderNotifications");
const { creditDriverDeliveryEarning } = require("./deliveryWallet");
const { recordDriverCodCollection } = require("./driverCodWallet");
const { verifyDeliveryOtpForOrder } = require("./deliveryOrderOtp");
const { creditVendorEarningsForDeliveredOrder } = require("./ecomOrderVendorEarnings");
const { getUserDeliveryBoyRatingForOrder } = require("./deliveryBoyRating");
const { formatRatingValue } = require("./productRating");

const PAYMENT_METHOD_LABELS = {
  cod: "Cash On Delivery",
  online: "Online Payment",
  wallet: "Wallet",
};

const DRIVER_STATUS_TABS = {
  new: ["new"],
  processing: ["processing"],
  accepted: ["processing"],
  out_for_delivery: ["out_for_delivery"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

const DRIVER_STATUS_DISPLAY = {
  new: { key: "new", label: "NEW", tone: "blue" },
  processing: { key: "processing", label: "PROCESSING", tone: "purple" },
  out_for_delivery: { key: "out_for_delivery", label: "DISPATCHED", tone: "orange" },
  completed: { key: "completed", label: "COMPLETED", tone: "green" },
  cancelled: { key: "cancelled", label: "CANCELLED", tone: "red" },
};

const VENDOR_ASSIGNED_READY_STATUSES = new Set(["confirmed", "processing", "shipped", "delivered"]);
const VENDOR_POOL_READY_STATUSES = new Set(["processing", "shipped", "delivered"]);

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

function normalizeDriverStatusTab(value) {
  if (!value) return null;
  const tab = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    new_deliveries: "new",
    new_delivery: "new",
    accept: "processing",
    accepted: "processing",
    accepted_orders: "processing",
    processing_orders: "processing",
    out_for_delivery: "out_for_delivery",
    outfordelivery: "out_for_delivery",
    dispatched: "out_for_delivery",
    delivered: "completed",
    deliver: "completed",
    complete: "completed",
    completed: "completed",
    completed_orders: "completed",
    delivered_orders: "completed",
    cancel: "cancelled",
  };
  const normalized = aliases[tab] || tab;
  return DRIVER_STATUS_TABS[normalized] ? normalized : null;
}

function isDriverAssignedToOrder(order, driverId) {
  const driverIdStr = String(driverId);
  if (order.deliveryBoy && String(order.deliveryBoy) === driverIdStr) return true;
  return (order.vendorFulfillments ?? []).some(
    (row) => row.deliveryBoy && String(row.deliveryBoy) === driverIdStr
  );
}

function isVendorReadyForDriver(order, driverId = null) {
  const fulfillments = order.vendorFulfillments ?? [];
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const assigned = driverId ? isDriverAssignedToOrder(order, driverId) : Boolean(order.deliveryBoy);
  const readyStatuses = assigned ? VENDOR_ASSIGNED_READY_STATUSES : VENDOR_POOL_READY_STATUSES;

  if (!fulfillments.length) {
    return readyStatuses.has(orderStatus);
  }

  return fulfillments.some((row) => {
    const status = String(row.status || "").toLowerCase();
    if (status === "cancelled") return false;
    return readyStatuses.has(status);
  });
}

function resolveDriverTab(order, driverId) {
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const driverStatus = String(order.driverDelivery?.status || "").toLowerCase();
  const isAssigned = isDriverAssignedToOrder(order, driverId);

  if (!isAssigned) return null;

  if (["cancelled", "refunded"].includes(orderStatus)) {
    return "cancelled";
  }
  if (driverStatus === "rejected") {
    return "cancelled";
  }
  if (orderStatus === "delivered" || driverStatus === "delivered") {
    return "completed";
  }
  if (driverStatus === "out_for_delivery") {
    return "out_for_delivery";
  }
  if (driverStatus === "processing" || driverStatus === "accepted") {
    return "processing";
  }
  if (driverStatus === "pending" || !driverStatus) {
    return "new";
  }
  return null;
}

function resolveDriverStatusDisplay(tabKey) {
  return (
    DRIVER_STATUS_DISPLAY[tabKey] ?? {
      key: tabKey || "new",
      label: String(tabKey || "new").toUpperCase(),
      tone: "grey",
    }
  );
}

function buildDeliveryAddress(order) {
  const snap =
    order.addressSnapshot && typeof order.addressSnapshot === "object"
      ? order.addressSnapshot
      : {};
  const addressLine =
    snap.fullAddress ||
    snap.addressLine ||
    [snap.houseNo, snap.buildingName, snap.roadName, snap.areaColony, snap.landmark, snap.city, snap.state, snap.pincode]
      .filter(Boolean)
      .join(", ");

  return {
    label: "Delivery",
    title: snap.fullName || snap.name || "",
    addressLine,
    fullAddress: addressLine,
    phone: snap.phone || snap.mobileNumber || "",
    pincode: snap.pincode || "",
  };
}

function buildPickupAddress(vendor) {
  if (!vendor) {
    return {
      label: "Pickup",
      title: "",
      addressLine: "",
      fullAddress: "",
      phone: "",
    };
  }

  const title = vendor.businessName || vendor.name || "Vendor";
  const addressLine = [vendor.businessAddress, vendor.city, vendor.state, vendor.pincode]
    .filter(Boolean)
    .join(", ");

  return {
    label: "Pickup",
    title,
    addressLine,
    fullAddress: addressLine || title,
    phone: vendor.businessPhone || vendor.phone || "",
  };
}

function vendorImagePath(vendor) {
  if (!vendor) return "";
  return vendor.shopLogo || vendor.profileImage || "";
}

function formatProductTitle(items) {
  if (!items.length) return "";
  const firstName = items[0].name || "Product";
  if (items.length === 1) return firstName;
  return `${firstName} +${items.length - 1} more`;
}

function sumItemQuantities(items) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

function sumItemTotals(items) {
  return items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
}

function normalizeMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

function buildDriverPaymentDetail(order) {
  const items = order.items ?? [];
  const subTotal = normalizeMoney(order.subTotal ?? sumItemTotals(items));
  const discountTotal = normalizeMoney(order.discountTotal);
  const taxTotal = normalizeMoney(order.taxTotal);
  let shippingCharge = normalizeMoney(order.shippingCharge);
  let grandTotal = normalizeMoney(order.grandTotal);

  if (!grandTotal) {
    grandTotal = normalizeMoney(subTotal + shippingCharge - discountTotal + taxTotal);
  }

  if (shippingCharge <= 0 && grandTotal > subTotal) {
    const inferred = normalizeMoney(grandTotal - subTotal - taxTotal + discountTotal);
    if (inferred > 0) {
      shippingCharge = inferred;
    }
  }

  return {
    subTotal,
    subTotalLabel: formatInrAmount(subTotal),
    shippingCharge,
    shippingChargeLabel: formatInrAmount(shippingCharge),
    shippingCost: shippingCharge,
    shippingCostLabel: formatInrAmount(shippingCharge),
    deliveryCharge: shippingCharge,
    deliveryChargeLabel: formatInrAmount(shippingCharge),
    discountTotal,
    discountTotalLabel: formatInrAmount(discountTotal),
    taxTotal,
    taxTotalLabel: formatInrAmount(taxTotal),
    grandTotal,
    grandTotalLabel: formatInrAmount(grandTotal),
    total: grandTotal,
    totalLabel: formatInrAmount(grandTotal),
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
}

function buildDriverPaymentSummary(paymentDetail) {
  return {
    subTotal: paymentDetail.subTotal,
    subTotalLabel: paymentDetail.subTotalLabel,
    shippingCharge: paymentDetail.shippingCharge,
    shippingChargeLabel: paymentDetail.shippingChargeLabel,
    shippingCost: paymentDetail.shippingCost,
    shippingCostLabel: paymentDetail.shippingCostLabel,
    deliveryCharge: paymentDetail.deliveryCharge,
    deliveryChargeLabel: paymentDetail.deliveryChargeLabel,
    discountTotal: paymentDetail.discountTotal,
    discountTotalLabel: paymentDetail.discountTotalLabel,
    taxTotal: paymentDetail.taxTotal,
    taxTotalLabel: paymentDetail.taxTotalLabel,
    grandTotal: paymentDetail.grandTotal,
    grandTotalLabel: paymentDetail.grandTotalLabel,
    totalAmount: paymentDetail.grandTotal,
    totalAmountLabel: paymentDetail.grandTotalLabel,
  };
}

function toCustomerDriverRatingPayload(ratingDoc, user, baseUrl) {
  if (!ratingDoc) return null;
  const profileImage = user?.profileImage ? toAbsoluteUploadUrl(user.profileImage, baseUrl) : "";
  const customerName = user?.name || "";
  return {
    rating: ratingDoc.rating,
    review: ratingDoc.review || "",
    createdAt: ratingDoc.createdAt,
    updatedAt: ratingDoc.updatedAt,
    customerName,
    name: customerName,
    customerImage: profileImage,
    image: profileImage,
    profileImage,
    customer: user
      ? {
          _id: user._id,
          name: customerName,
          profileImage,
          image: profileImage,
        }
      : null,
  };
}

function resolvePrimaryVendorId(order) {
  const firstItemVendor = order.items?.find((item) => item.vendor)?.vendor;
  if (firstItemVendor) return firstItemVendor;
  return order.vendorFulfillments?.[0]?.vendor ?? null;
}

function resolveDriverOrderActions(order, driverId, tabKey) {
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const cancelled = ["cancelled", "refunded"].includes(orderStatus);
  const canAccept = !cancelled && tabKey === "new";
  const canReject = !cancelled && tabKey === "new";
  const canMarkDelivered = !cancelled && tabKey === "out_for_delivery";

  const actions = {
    canAccept,
    canReject,
    canMarkDelivered,
    driverOrderStatus: tabKey,
  };

  if (canAccept) {
    actions.primaryAction = { key: "accept", label: "Accept" };
    actions.secondaryAction = { key: "reject", label: "Reject" };
  } else if (canMarkDelivered) {
    actions.primaryAction = { key: "delivered", label: "Mark Delivered" };
  }

  return actions;
}

function initDriverDeliveryPending(orderDoc) {
  if (!orderDoc.deliveryBoy) return;
  if (!orderDoc.driverDelivery) {
    orderDoc.driverDelivery = {};
  }
  if (!orderDoc.driverDelivery.status) {
    orderDoc.driverDelivery.status = "pending";
  }
}

function syncDriverDeliveryFromVendorStatus(orderDoc) {
  if (!orderDoc?.deliveryBoy) return;

  if (!orderDoc.driverDelivery) {
    orderDoc.driverDelivery = {};
  }

  const orderStatus = String(orderDoc.orderStatus || "").toLowerCase();
  const now = new Date();

  if (orderStatus === "delivered") {
    orderDoc.driverDelivery.status = "delivered";
    orderDoc.driverDelivery.deliveredAt = orderDoc.driverDelivery.deliveredAt || now;
    return;
  }

  if (orderStatus === "shipped") {
    const driverStatus = String(orderDoc.driverDelivery?.status || "").toLowerCase();
    if (["processing", "accepted"].includes(driverStatus)) {
      orderDoc.driverDelivery.status = "out_for_delivery";
      orderDoc.driverDelivery.outForDeliveryAt = orderDoc.driverDelivery.outForDeliveryAt || now;
    }
  }
}

async function hydrateDriverOrderContext(orders, baseUrl) {
  const productIds = [
    ...new Set(
      orders
        .flatMap((order) => (order.items ?? []).map((item) => String(item.product)))
        .filter(Boolean)
    ),
  ];
  const vendorIds = [
    ...new Set(
      orders
        .flatMap((order) => {
          const ids = [];
          for (const item of order.items ?? []) {
            if (item.vendor) ids.push(String(item.vendor));
          }
          for (const row of order.vendorFulfillments ?? []) {
            if (row.vendor) ids.push(String(row.vendor));
          }
          return ids;
        })
        .filter(Boolean)
    ),
  ];
  const userIds = [...new Set(orders.map((order) => String(order.user)).filter(Boolean))];

  const [products, vendors, users] = await Promise.all([
    productIds.length
      ? Product.find({ _id: { $in: productIds.map((id) => toObjectId(id)) } })
          .select("_id thumbnail")
          .lean()
      : [],
    vendorIds.length
      ? Vendor.find({ _id: { $in: vendorIds.map((id) => toObjectId(id)) } })
          .select("name businessName businessAddress city state pincode phone businessPhone profileImage shopLogo")
          .lean()
      : [],
    userIds.length
      ? User.find({ _id: { $in: userIds.map((id) => toObjectId(id)) } })
          .select("name phone profileImage")
          .lean()
      : [],
  ]);

  return {
    productMap: new Map(products.map((row) => [String(row._id), row])),
    vendorMap: new Map(vendors.map((row) => [String(row._id), row])),
    userMap: new Map(users.map((row) => [String(row._id), row])),
    baseUrl,
  };
}

function toDriverOrderCard(order, driverId, context) {
  const items = order.items ?? [];
  const primaryItem = items[0] ?? null;
  const product = primaryItem ? context.productMap.get(String(primaryItem.product)) : null;
  const user = context.userMap.get(String(order.user));
  const vendorId = resolvePrimaryVendorId(order);
  const vendor = vendorId ? context.vendorMap.get(String(vendorId)) : null;
  const tabKey = resolveDriverTab(order, driverId);
  const status = resolveDriverStatusDisplay(tabKey);
  const placedAt = order.placedAt ?? order.createdAt;
  const paymentDetail = buildDriverPaymentDetail(order);
  const totalAmount = paymentDetail.grandTotal;
  const totalQuantity = sumItemQuantities(items);
  const vendorImagePathValue = vendorImagePath(vendor);
  const vendorImage = vendorImagePathValue
    ? toAbsoluteUploadUrl(vendorImagePathValue, context.baseUrl)
    : "";

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderDisplayId: formatOrderDisplayId(order),
    productId: primaryItem?.product ?? null,
    productName: formatProductTitle(items),
    thumbnail: product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, context.baseUrl) : "",
    productImage: product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, context.baseUrl) : "",
    itemCount: items.length,
    quantity: totalQuantity,
    totalQuantity,
    quantityLabel: `QTY: ${totalQuantity}`,
    customerName: user?.name || buildDeliveryAddress(order).title || "",
    customerId: user?._id ?? order.user,
    customerImage: user?.profileImage ? toAbsoluteUploadUrl(user.profileImage, context.baseUrl) : "",
    customerProfileImage: user?.profileImage ? toAbsoluteUploadUrl(user.profileImage, context.baseUrl) : "",
    vendorId: vendorId ?? null,
    vendorName: vendor?.businessName || vendor?.name || "",
    vendorImage,
    vendorShopLogo: vendor?.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, context.baseUrl) : "",
    vendorProfileImage: vendor?.profileImage ? toAbsoluteUploadUrl(vendor.profileImage, context.baseUrl) : "",
    price: totalAmount,
    priceLabel: formatInrAmount(totalAmount),
    totalAmount,
    totalAmountLabel: formatInrAmount(totalAmount),
    subTotal: paymentDetail.subTotal,
    subTotalLabel: paymentDetail.subTotalLabel,
    shippingCharge: paymentDetail.shippingCharge,
    shippingChargeLabel: paymentDetail.shippingChargeLabel,
    shippingCost: paymentDetail.shippingCost,
    shippingCostLabel: paymentDetail.shippingCostLabel,
    deliveryCharge: paymentDetail.deliveryCharge,
    deliveryChargeLabel: paymentDetail.deliveryChargeLabel,
    grandTotal: paymentDetail.grandTotal,
    grandTotalLabel: paymentDetail.grandTotalLabel,
    paymentDetail,
    summary: buildDriverPaymentSummary(paymentDetail),
    currency: "INR",
    symbol: "₹",
    status: status.key,
    statusLabel: status.label,
    statusTone: status.tone,
    driverOrderStatus: tabKey,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    pickupAddress: buildPickupAddress(vendor),
    deliveryAddress: buildDeliveryAddress(order),
    placedAt,
    orderDate: formatShortOrderDate(placedAt),
    groupDate: formatDateOnly(placedAt),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    actions: resolveDriverOrderActions(order, driverId, tabKey),
  };
}

function toDriverOrderDetail(order, driverId, context, { customerRating = null } = {}) {
  const card = toDriverOrderCard(order, driverId, context);
  const user = context.userMap.get(String(order.user));
  const paymentDetail = buildDriverPaymentDetail(order);
  const customerDriverRating = toCustomerDriverRatingPayload(
    customerRating,
    user,
    context.baseUrl
  );

  return {
    ...card,
    items: (order.items ?? []).map((item) => {
      const product = context.productMap.get(String(item.product));
      return {
        productId: item.product,
        productName: item.name,
        sku: item.sku,
        variantSku: item.variantSku || "",
        quantity: item.quantity,
        quantityLabel: `QTY: ${item.quantity}`,
        unitPrice: item.unitPrice,
        unitPriceLabel: formatInrAmount(item.unitPrice),
        totalPrice: item.totalPrice,
        totalPriceLabel: formatInrAmount(item.totalPrice),
        thumbnail: product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, context.baseUrl) : "",
        productImage: product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, context.baseUrl) : "",
      };
    }),
    customer: {
      userId: user?._id ?? order.user,
      name: user?.name || "",
      phone: user?.phone || "",
      profileImage: user?.profileImage ? toAbsoluteUploadUrl(user.profileImage, context.baseUrl) : "",
      image: user?.profileImage ? toAbsoluteUploadUrl(user.profileImage, context.baseUrl) : "",
    },
    vendor: (() => {
      const vendorId = resolvePrimaryVendorId(order);
      const vendor = vendorId ? context.vendorMap.get(String(vendorId)) : null;
      const imagePath = vendorImagePath(vendor);
      return {
        vendorId: vendor?._id ?? vendorId ?? null,
        name: vendor?.businessName || vendor?.name || "",
        phone: vendor?.businessPhone || vendor?.phone || "",
        shopLogo: vendor?.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, context.baseUrl) : "",
        profileImage: vendor?.profileImage ? toAbsoluteUploadUrl(vendor.profileImage, context.baseUrl) : "",
        image: imagePath ? toAbsoluteUploadUrl(imagePath, context.baseUrl) : "",
      };
    })(),
    notes: order.notes || "",
    driverDelivery: order.driverDelivery || null,
    paymentDetail,
    summary: buildDriverPaymentSummary(paymentDetail),
    customerRating: customerDriverRating,
    driverRatingByCustomer: customerDriverRating,
  };
}

async function findDriverOrders(driverId, { statusTab = null } = {}) {
  const driverObjectId = toObjectId(driverId);
  const normalizedTab = normalizeDriverStatusTab(statusTab);

  const filter = {
    $or: [
      { deliveryBoy: driverObjectId },
      { "vendorFulfillments.deliveryBoy": driverObjectId },
    ],
  };

  if (normalizedTab === "completed") {
    filter.deliveryBoy = driverObjectId;
    filter.orderStatus = "delivered";
    delete filter.$or;
  } else if (normalizedTab === "cancelled") {
    filter.deliveryBoy = driverObjectId;
    filter.orderStatus = { $in: ["cancelled", "refunded"] };
    delete filter.$or;
  } else if (normalizedTab) {
    filter.orderStatus = { $nin: ["cancelled", "refunded", "delivered"] };
  } else {
    filter.orderStatus = { $nin: ["cancelled", "refunded"] };
  }

  const orders = await Order.find(filter).sort({ placedAt: -1, createdAt: -1 }).lean();

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

  const refreshed = needsBackfill.length
    ? await Order.find({
        _id: { $in: orders.map((order) => order._id) },
      })
        .sort({ placedAt: -1, createdAt: -1 })
        .lean()
    : orders;

  return refreshed.filter((order) => {
    if (!isVendorReadyForDriver(order, driverId)) return false;

    const tabKey = resolveDriverTab(order, driverId);
    if (!tabKey || tabKey === "cancelled") return false;

    const isAssigned = isDriverAssignedToOrder(order, driverId);

    if (normalizedTab === "completed") {
      return isAssigned && tabKey === "completed";
    }

    if (!isAssigned) return false;

    if (!normalizedTab) return true;
    return tabKey === normalizedTab;
  });
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

async function listDriverOrders(driverId, options = {}) {
  const { statusTab = null, page = 1, limit = 20, baseUrl = "" } = options;
  const orders = await findDriverOrders(driverId, { statusTab });
  const context = await hydrateDriverOrderContext(orders, baseUrl);
  const rows = orders.map((order) => toDriverOrderCard(order, driverId, context));
  const paginated = paginateRows(rows, page, limit);

  return {
    orders: paginated.rows,
    total: paginated.total,
    page: paginated.page,
    limit: paginated.limit,
    pages: paginated.pages,
  };
}

async function loadDriverOrder(driverId, orderId) {
  const orderDoc = await Order.findById(toObjectId(orderId));
  if (!orderDoc) {
    throw new AppError("Order not found", 404);
  }

  await ensureVendorFulfillmentsPersisted(orderDoc);
  const order = orderDoc.toObject();

  if (!isVendorReadyForDriver(order, driverId)) {
    throw new AppError("Order not found", 404);
  }

  const tabKey = resolveDriverTab(order, driverId);
  const isAssigned = isDriverAssignedToOrder(order, driverId);

  if (!tabKey || tabKey === "cancelled") {
    throw new AppError("Order not found", 404);
  }

  if (tabKey === "completed") {
    if (!isAssigned) throw new AppError("Order not found", 404);
  } else if (!isAssigned) {
    throw new AppError("Order not found", 404);
  }

  return { orderDoc, order };
}

async function getDriverOrderDetail(driverId, orderId, baseUrl) {
  const { order } = await loadDriverOrder(driverId, orderId);
  const [context, customerRating] = await Promise.all([
    hydrateDriverOrderContext([order], baseUrl),
    getUserDeliveryBoyRatingForOrder(order.user, order._id),
  ]);
  return toDriverOrderDetail(order, driverId, context, { customerRating });
}

async function acceptDriverOrder(driverId, orderId) {
  const { orderDoc, order } = await loadDriverOrder(driverId, orderId);
  const tabKey = resolveDriverTab(order, driverId);

  if (tabKey !== "new") {
    throw new AppError("Only new deliveries can be accepted", 400);
  }

  if (!orderDoc.deliveryBoy || String(orderDoc.deliveryBoy) !== String(driverId)) {
    throw new AppError("Order is not assigned to you. Wait for admin to assign this delivery.", 403);
  }

  const previousStatus = orderDoc.orderStatus;
  for (const row of orderDoc.vendorFulfillments ?? []) {
    if (VENDOR_ASSIGNED_READY_STATUSES.has(String(row.status || "").toLowerCase()) && !row.deliveryBoy) {
      row.deliveryBoy = toObjectId(driverId);
    }
  }

  orderDoc.driverDelivery = {
    ...(orderDoc.driverDelivery?.toObject?.() ?? orderDoc.driverDelivery ?? {}),
    status:
      String(orderDoc.orderStatus || "").toLowerCase() === "shipped"
        ? "out_for_delivery"
        : "processing",
    acceptedAt: new Date(),
    rejectedAt: null,
    rejectionReason: "",
    rejectedBy: null,
    ...(String(orderDoc.orderStatus || "").toLowerCase() === "shipped"
      ? { outForDeliveryAt: new Date() }
      : {}),
  };

  await orderDoc.save();
  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "delivery",
  });

  return orderDoc.toObject();
}

async function rejectDriverOrder(driverId, orderId, reason) {
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) {
    throw new AppError("Rejection reason is required", 400);
  }

  const { orderDoc, order } = await loadDriverOrder(driverId, orderId);
  const tabKey = resolveDriverTab(order, driverId);

  if (tabKey !== "new") {
    throw new AppError("Only new deliveries can be rejected", 400);
  }

  const previousStatus = orderDoc.orderStatus;

  if (orderDoc.deliveryBoy && String(orderDoc.deliveryBoy) === String(driverId)) {
    orderDoc.deliveryBoy = null;
  }

  for (const row of orderDoc.vendorFulfillments ?? []) {
    if (row.deliveryBoy && String(row.deliveryBoy) === String(driverId)) {
      row.deliveryBoy = null;
    }
  }

  orderDoc.driverDelivery = {
    status: "rejected",
    acceptedAt: null,
    rejectedAt: new Date(),
    rejectionReason: normalizedReason,
    rejectedBy: toObjectId(driverId),
    outForDeliveryAt: null,
    deliveredAt: null,
  };

  await orderDoc.save();
  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "delivery",
  });

  return orderDoc.toObject();
}

async function markDriverOrderDelivered(driverId, orderId, options = {}) {
  const { orderDoc, order } = await loadDriverOrder(driverId, orderId);
  const tabKey = resolveDriverTab(order, driverId);

  if (tabKey !== "out_for_delivery") {
    throw new AppError("Only out-for-delivery orders can be marked delivered", 400);
  }

  if (!orderDoc.deliveryBoy || String(orderDoc.deliveryBoy) !== String(driverId)) {
    throw new AppError("Order is not assigned to you", 403);
  }

  await verifyDeliveryOtpForOrder(orderId, options.otp ?? options.deliveryOtp, { driverId });

  const previousStatus = orderDoc.orderStatus;
  const now = new Date();

  for (const row of orderDoc.vendorFulfillments ?? []) {
    if (String(row.status || "").toLowerCase() === "cancelled") continue;

    const assignedDriver = String(row.deliveryBoy || orderDoc.deliveryBoy || "");
    if (assignedDriver && assignedDriver !== String(driverId)) continue;

    row.status = "delivered";
    row.deliveredAt = now;
    if (!row.deliveryBoy && orderDoc.deliveryBoy) {
      row.deliveryBoy = orderDoc.deliveryBoy;
    }
  }

  orderDoc.orderStatus = "delivered";
  if (String(orderDoc.paymentMethod || "").toLowerCase() === "cod") {
    orderDoc.paymentStatus = "paid";
    orderDoc.codCollectedAt = now;
    orderDoc.codCollectedBy = driverId;
    orderDoc.codSettlementStatus = "pending";
    orderDoc.codSettledAmount = 0;
  }

  orderDoc.driverDelivery = {
    ...(orderDoc.driverDelivery?.toObject?.() ?? orderDoc.driverDelivery ?? {}),
    status: "delivered",
    deliveredAt: now,
  };

  await orderDoc.save();

  if (String(orderDoc.paymentMethod || "").toLowerCase() === "cod") {
    try {
      await recordDriverCodCollection(driverId, orderDoc.toObject());
    } catch (error) {
      console.error("[driver-cod]", error?.message || error);
    }
  }

  try {
    const customerName =
      orderDoc.addressSnapshot?.fullName || orderDoc.addressSnapshot?.name || "";
    const configuredEarning = Number(process.env.DRIVER_DELIVERY_EARNING);
    const earning =
      Number.isFinite(configuredEarning) && configuredEarning > 0
        ? configuredEarning
        : Number(orderDoc.shippingCharge) || 50;
    await creditDriverDeliveryEarning(driverId, orderDoc.toObject(), earning, customerName);
  } catch {
    // Delivery completion should not fail if wallet credit fails.
  }

  try {
    await creditVendorEarningsForDeliveredOrder(orderDoc);
  } catch (error) {
    console.error("[vendor-wallet]", error?.message || error);
  }

  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "delivery",
  });

  return orderDoc.toObject();
}

async function countCancelledDriverDeliveries(driverId) {
  const driverObjectId = toObjectId(driverId);
  return Order.countDocuments({
    deliveryBoy: driverObjectId,
    $or: [
      { orderStatus: { $in: ["cancelled", "refunded"] } },
      { "driverDelivery.status": "rejected" },
    ],
  });
}

async function computeDriverHomeStats(driverId) {
  const driverObjectId = toObjectId(driverId);
  const [assignedDeliveries, cancelledDeliveries, newOrders, processingOrders, outForDeliveryOrders, deliveredOrders] =
    await Promise.all([
      Order.countDocuments({ deliveryBoy: driverObjectId }),
      countCancelledDriverDeliveries(driverId),
      findDriverOrders(driverId, { statusTab: "new" }),
      findDriverOrders(driverId, { statusTab: "processing" }),
      findDriverOrders(driverId, { statusTab: "out_for_delivery" }),
      findDriverOrders(driverId, { statusTab: "completed" }),
    ]);

  const pendingDeliveries = newOrders.length + processingOrders.length + outForDeliveryOrders.length;
  const completedDeliveries = deliveredOrders.length;

  return {
    assignedDeliveries,
    pendingDeliveries,
    completedDeliveries,
    cancelledDeliveries,
  };
}

async function getDriverHomeDashboard(driverId, options = {}) {
  const { baseUrl = "", newDeliveriesLimit = 5 } = options;
  const { getDriverWalletBalance, getDriverLifetimeEarnings, formatInrAmount: formatWalletInr } = require("./deliveryWallet");

  const [stats, totalEarnings, walletBalance, newOrderRows, driverProfile] = await Promise.all([
    computeDriverHomeStats(driverId),
    getDriverLifetimeEarnings(driverId),
    getDriverWalletBalance(driverId),
    findDriverOrders(driverId, { statusTab: "new" }),
    DeliveryBoy.findById(driverId).select("averageRating ratingCount").lean(),
  ]);

  const ratingCount = Number(driverProfile?.ratingCount) || 0;
  const averageRating = formatRatingValue(driverProfile?.averageRating, ratingCount);

  const previewOrders = newOrderRows.slice(0, Math.max(1, newDeliveriesLimit));
  const context = await hydrateDriverOrderContext(previewOrders, baseUrl);
  const newDeliveries = previewOrders.map((order) => toDriverOrderCard(order, driverId, context));

  return {
    totalEarnings,
    totalEarningsLabel: formatWalletInr(totalEarnings),
    walletBalance,
    walletBalanceLabel: formatWalletInr(walletBalance),
    average_rating: averageRating,
    rating: averageRating,
    ratingCount,
    stats: {
      assignedDeliveries: stats.assignedDeliveries,
      pendingDeliveries: stats.pendingDeliveries,
      completedDeliveries: stats.completedDeliveries,
      cancelledDeliveries: stats.cancelledDeliveries,
    },
    newDeliveries,
    newDeliveriesTotal: newOrderRows.length,
  };
}

module.exports = {
  normalizeDriverStatusTab,
  initDriverDeliveryPending,
  syncDriverDeliveryFromVendorStatus,
  listDriverOrders,
  getDriverOrderDetail,
  getDriverHomeDashboard,
  acceptDriverOrder,
  rejectDriverOrder,
  markDriverOrderDelivered,
};
