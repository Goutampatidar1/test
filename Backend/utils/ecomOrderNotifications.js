const mongoose = require("mongoose");
const AppNotification = require("../models/other/appNotification");
const User = require("../models/entity/user");
const Vendor = require("../models/entity/vendor");
const DeliveryBoy = require("../models/entity/deliveryboy");
const { sendFcmNotification } = require("./pushNotification");
const { formatInrAmount } = require("./publicProductList");
const { notifyAllAdmins } = require("./adminInbox");

const ORDER_STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function formatOrderStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  return ORDER_STATUS_LABELS[key] || key || "Updated";
}

function toObjectId(value) {
  if (!value) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function collectVendorIdsFromOrder(order) {
  const ids = new Set();
  for (const item of order?.items ?? []) {
    if (item?.vendor) ids.add(String(item.vendor));
  }
  for (const row of order?.vendorFulfillments ?? []) {
    if (row?.vendor) ids.add(String(row.vendor));
  }
  return [...ids];
}

async function resolveFcmToken(recipientType, recipientId) {
  const Model =
    recipientType === "user"
      ? User
      : recipientType === "vendor"
        ? Vendor
        : recipientType === "deliveryBoy"
          ? DeliveryBoy
          : null;
  if (!Model) return "";
  const row = await Model.findById(recipientId).select("fcm_id").lean();
  return row?.fcm_id ? String(row.fcm_id).trim() : "";
}

async function deliverNotification({
  recipientType,
  recipientId,
  type,
  title,
  message,
  order,
  orderStatus = "",
  metadata = {},
}) {
  const notification = await AppNotification.create({
    recipientType,
    recipient: recipientId,
    type,
    title,
    message,
    order: order?._id ?? order ?? null,
    orderNumber: order?.orderNumber ?? "",
    orderStatus: orderStatus || order?.orderStatus || "",
    metadata,
  });

  const fcmToken = await resolveFcmToken(recipientType, recipientId);
  if (fcmToken) {
    await sendFcmNotification(fcmToken, {
      title,
      body: message,
      data: {
        type,
        orderId: String(order?._id ?? ""),
        orderNumber: String(order?.orderNumber ?? ""),
        orderStatus: String(orderStatus || order?.orderStatus || ""),
        notificationId: String(notification._id),
      },
    });
  }

  return notification;
}

function queueEcomNotification(task) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error("[ecom-notification]", error?.message || error);
      });
  });
}

async function notifyOrderPlaced(order) {
  if (!order?._id || !order?.user) return;

  const amountLabel = formatInrAmount(order.grandTotal);
  const orderNumber = order.orderNumber || String(order._id);

  await deliverNotification({
    recipientType: "user",
    recipientId: order.user,
    type: "ecom_order_placed",
    title: "Order placed",
    message: `Your order ${orderNumber} was placed successfully. Total ${amountLabel}.`,
    order,
    orderStatus: order.orderStatus || "pending",
    metadata: { event: "order_placed" },
  });

  const vendorIds = collectVendorIdsFromOrder(order);
  await Promise.all(
    vendorIds.map((vendorId) =>
      deliverNotification({
        recipientType: "vendor",
        recipientId: toObjectId(vendorId),
        type: "ecom_order_placed",
        title: "New order received",
        message: `You have a new order ${orderNumber}. Total ${amountLabel}.`,
        order,
        orderStatus: order.orderStatus || "pending",
        metadata: { event: "order_placed" },
      })
    )
  );

  await notifyAllAdmins({
    type: "ecom_order_placed",
    title: "New order placed",
    message: `Order ${orderNumber} was placed. Total ${amountLabel}.`,
    order,
    orderStatus: order.orderStatus || "pending",
    metadata: {
      event: "order_placed",
      linkPath: `/admin/orders/ecom/${order._id}`,
    },
  });
}

async function notifyOrderStatusUpdated(order, { previousStatus, newStatus, source = "system" } = {}) {
  if (!order?._id || !order?.user) return;

  const prev = String(previousStatus || "").toLowerCase();
  const next = String(newStatus || order.orderStatus || "").toLowerCase();
  if (!next || prev === next) return;

  const statusLabel = formatOrderStatusLabel(next);
  const orderNumber = order.orderNumber || String(order._id);

  await deliverNotification({
    recipientType: "user",
    recipientId: order.user,
    type: "ecom_order_status_updated",
    title: "Order status updated",
    message: `Your order ${orderNumber} is now ${statusLabel}.`,
    order,
    orderStatus: next,
    metadata: { event: "order_status_updated", previousStatus: prev, newStatus: next, source },
  });

  const vendorIds = collectVendorIdsFromOrder(order);
  if (source === "admin") {
    await Promise.all(
      vendorIds.map((vendorId) =>
        deliverNotification({
          recipientType: "vendor",
          recipientId: toObjectId(vendorId),
          type: "ecom_order_status_updated",
          title: "Order status updated",
          message: `Order ${orderNumber} was updated to ${statusLabel}.`,
          order,
          orderStatus: next,
          metadata: { event: "order_status_updated", previousStatus: prev, newStatus: next, source },
        })
      )
    );
  }

  if (next === "cancelled" || next === "refunded") {
    await notifyAllAdmins({
      type: "ecom_order_status_updated",
      title: next === "refunded" ? "Order refunded" : "Order cancelled",
      message: `Order ${orderNumber} is now ${statusLabel}.`,
      order,
      orderStatus: next,
      metadata: {
        event: "order_status_updated",
        previousStatus: prev,
        newStatus: next,
        source,
        linkPath: `/admin/orders/ecom/${order._id}`,
      },
    });
  }
}

function queueOrderPlacedNotification(order) {
  queueEcomNotification(() => notifyOrderPlaced(order));
}

async function notifyDriverAssigned(order, driverId, { previousDriverId } = {}) {
  if (!order?._id || !driverId) return;
  if (previousDriverId && String(previousDriverId) === String(driverId)) return;

  const orderNumber = order.orderNumber || String(order._id);
  const amountLabel = formatInrAmount(order.grandTotal);

  await deliverNotification({
    recipientType: "deliveryBoy",
    recipientId: toObjectId(driverId),
    type: "delivery_order_assigned",
    title: "New delivery assigned",
    message: `Admin assigned you order ${orderNumber}. Total ${amountLabel}. Accept it from New orders.`,
    order,
    orderStatus: order.orderStatus || "",
    metadata: {
      event: "delivery_assigned",
      linkPath: `/orders/${order._id}`,
    },
  });
}

function queueOrderStatusUpdatedNotification(order, options = {}) {
  queueEcomNotification(() => notifyOrderStatusUpdated(order, options));
}

function queueDriverAssignedNotification(order, driverId, options = {}) {
  queueEcomNotification(() => notifyDriverAssigned(order, driverId, options));
}

module.exports = {
  ORDER_STATUS_LABELS,
  formatOrderStatusLabel,
  notifyOrderPlaced,
  notifyOrderStatusUpdated,
  queueOrderPlacedNotification,
  queueOrderStatusUpdatedNotification,
  notifyDriverAssigned,
  queueDriverAssignedNotification,
  deliverNotification,
};
