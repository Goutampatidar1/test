const Order = require("../models/other/order");
const Product = require("../models/other/product");
const AppError = require("./AppError");
const { restoreProductStock } = require("./ecomCheckout");
const { cancelEcomTransactionForOrder } = require("./ecomTransaction");
const { queueOrderStatusUpdatedNotification } = require("./ecomOrderNotifications");
const { initDriverDeliveryPending, syncDriverDeliveryFromVendorStatus } = require("./deliveryDriverOrder");
const { cancelDeliveryOtpForOrder } = require("./deliveryOrderOtp");
const {
  shouldRefundOrderToWallet,
  refundEcomOrderToWallet,
  isCodPaymentMethod,
} = require("./userWallet");

const STATUS_ALIASES = {
  accept: "confirmed",
  accepted: "confirmed",
  out_for_delivery: "shipped",
  outfordelivery: "shipped",
  dispatched: "shipped",
  reject: "cancelled",
  rejected: "cancelled",
  complete: "delivered",
  completed: "delivered",
};

function normalizeFulfillmentStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return STATUS_ALIASES[normalized] || normalized;
}

function itemVendorId(item) {
  const vendorRef = item?.vendor?._id || item?.vendor;
  return vendorRef ? String(vendorRef) : "";
}

function productRole(product) {
  if (!product || typeof product !== "object") return "";
  return String(product.role || "");
}

function isAdminFulfilledOrder(order) {
  if ((order?.vendors ?? []).length) return false;

  const items = order?.items ?? [];
  if (!items.length) return false;

  for (const item of items) {
    if (itemVendorId(item)) return false;
    if (productRole(item.product) === "Vendor") return false;
  }

  const fulfillments = order.vendorFulfillments ?? [];
  if (fulfillments.some((row) => row?.vendor)) return false;
  return true;
}

async function assertAdminFulfilledOrder(orderDoc) {
  const items = orderDoc.items ?? [];
  if (!items.length) {
    throw new AppError("This order has no items to fulfill", 400);
  }

  const productIds = [...new Set(items.map((item) => String(item.product || "")).filter(Boolean))];
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select("role addedById")
        .lean()
    : [];
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  for (const item of items) {
    if (itemVendorId(item)) {
      throw new AppError("Vendor items are fulfilled by the vendor", 400);
    }
    const product = productMap.get(String(item.product));
    if (product?.role === "Vendor") {
      throw new AppError("Vendor items are fulfilled by the vendor", 400);
    }
  }

  if ((orderDoc.vendorFulfillments ?? []).some((row) => row?.vendor)) {
    throw new AppError("Vendor items are fulfilled by the vendor", 400);
  }
}

function resolveAdminFulfillmentActions(order) {
  const orderStatus = String(order?.orderStatus || "pending").toLowerCase();
  const orderCancelled = orderStatus === "cancelled" || orderStatus === "refunded";
  const hasAssignedDriver = Boolean(order?.deliveryBoy);

  const canAccept = !orderCancelled && orderStatus === "pending";
  const canReject = canAccept;
  const canMarkOutForDelivery = !orderCancelled && ["confirmed", "processing"].includes(orderStatus);
  const canMarkDelivered = !orderCancelled && orderStatus === "shipped" && !hasAssignedDriver;

  const actions = {
    canAccept,
    canReject,
    canMarkOutForDelivery,
    canMarkDelivered,
    orderStatus,
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

async function restoreAdminOrderStock(orderDoc) {
  for (const item of orderDoc.items ?? []) {
    await restoreProductStock({
      product: item.product,
      variantSku: item.variantSku || "",
      quantity: item.quantity,
      name: item.name,
    });
  }
}

async function rejectAdminFulfilledOrderDoc(orderDoc, reason) {
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) {
    throw new AppError("Rejection reason is required", 400);
  }

  const current = String(orderDoc.orderStatus || "pending").toLowerCase();
  if (current !== "pending") {
    throw new AppError("Only new orders can be rejected", 400);
  }

  const previousStatus = orderDoc.orderStatus;
  const unpaidCod = isCodPaymentMethod(orderDoc.paymentMethod);
  const needsWalletRefund = !unpaidCod && (await shouldRefundOrderToWallet(orderDoc));
  let refunded = false;

  await restoreAdminOrderStock(orderDoc);

  if (needsWalletRefund) {
    const refundResult = await refundEcomOrderToWallet(orderDoc, normalizedReason);
    refunded = Boolean(refundResult?.refunded || refundResult?.alreadyRefunded);
  }

  const now = new Date();
  orderDoc.orderStatus = "cancelled";
  orderDoc.cancellationReason = normalizedReason;
  orderDoc.cancelledAt = now;

  if (refunded) {
    orderDoc.paymentStatus = "refunded";
  } else if (unpaidCod && String(orderDoc.paymentStatus || "").toLowerCase() !== "paid") {
    orderDoc.paymentStatus = "failed";
  } else if (String(orderDoc.paymentStatus || "").toLowerCase() === "pending") {
    orderDoc.paymentStatus = "failed";
  }

  await orderDoc.save();
  await cancelDeliveryOtpForOrder(orderDoc._id).catch(() => {});
  await cancelEcomTransactionForOrder(orderDoc, normalizedReason, { refunded });

  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "admin",
  });

  return orderDoc.toObject();
}

async function acceptAdminFulfilledOrderDoc(orderDoc) {
  const current = String(orderDoc.orderStatus || "pending").toLowerCase();
  if (current !== "pending") {
    throw new AppError("Only new orders can be accepted", 400);
  }

  const previousStatus = orderDoc.orderStatus;
  orderDoc.orderStatus = "confirmed";

  if (orderDoc.deliveryBoy) {
    initDriverDeliveryPending(orderDoc);
  }

  await orderDoc.save();
  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "admin",
  });
  return orderDoc.toObject();
}

async function updateAdminFulfilledOrderStatus(orderId, nextStatusRaw, { reason } = {}) {
  if (!nextStatusRaw) {
    throw new AppError("status is required", 400);
  }

  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) {
    throw new AppError("Order not found", 404);
  }

  await assertAdminFulfilledOrder(orderDoc);

  const nextStatus = normalizeFulfillmentStatus(nextStatusRaw);
  const current = String(orderDoc.orderStatus || "pending").toLowerCase();

  if (["cancelled", "refunded"].includes(current)) {
    throw new AppError("This order is no longer available", 400);
  }

  if (nextStatus === "cancelled") {
    return rejectAdminFulfilledOrderDoc(orderDoc, reason);
  }

  if (nextStatus === "confirmed") {
    return acceptAdminFulfilledOrderDoc(orderDoc);
  }

  if (nextStatus === "processing") {
    if (current === "pending") {
      throw new AppError("Accept the order first", 400);
    }
    if (["confirmed", "processing"].includes(current)) {
      return orderDoc.toObject();
    }
    throw new AppError(`Cannot move order from ${current} to processing`, 400);
  }

  if (!["shipped", "delivered"].includes(nextStatus)) {
    throw new AppError("Invalid order status. Use confirmed, shipped, delivered, or cancelled", 400);
  }

  const canShip = nextStatus === "shipped" && ["confirmed", "processing"].includes(current);
  const canDeliver = nextStatus === "delivered" && current === "shipped";
  if (!canShip && !canDeliver) {
    throw new AppError(`Cannot move order from ${current} to ${nextStatus}`, 400);
  }

  const hasAssignedDriver = Boolean(orderDoc.deliveryBoy);
  if (nextStatus === "delivered" && hasAssignedDriver) {
    throw new AppError("Assigned driver will mark this order as delivered", 400);
  }

  const previousStatus = orderDoc.orderStatus;
  orderDoc.orderStatus = nextStatus;

  if (
    nextStatus === "delivered" &&
    String(orderDoc.paymentMethod || "").toLowerCase() === "cod"
  ) {
    orderDoc.paymentStatus = "paid";
  }

  syncDriverDeliveryFromVendorStatus(orderDoc);
  await orderDoc.save();

  queueOrderStatusUpdatedNotification(orderDoc.toObject(), {
    previousStatus,
    newStatus: orderDoc.orderStatus,
    source: "admin",
  });

  return orderDoc.toObject();
}

module.exports = {
  isAdminFulfilledOrder,
  resolveAdminFulfillmentActions,
  updateAdminFulfilledOrderStatus,
};
