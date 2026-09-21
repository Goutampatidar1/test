const AppNotification = require("../models/other/appNotification");
const AppError = require("./AppError");
const { getPagination } = require("./listQuery");

function toPublicAppNotification(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    orderId: doc.order ?? null,
    orderNumber: doc.orderNumber || "",
    orderStatus: doc.orderStatus || "",
    linkPath: doc.metadata?.linkPath || "",
    isRead: !!doc.isRead,
    metadata: doc.metadata ?? {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listRecipientNotifications(recipientType, recipientId, query = {}) {
  const { page, limit, skip } = getPagination(query);
  const filter = { recipientType, recipient: recipientId };

  if (String(query.unreadOnly || query.unread || "").toLowerCase() === "true") {
    filter.isRead = false;
  }

  const [rows, total, unreadCount] = await Promise.all([
    AppNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AppNotification.countDocuments(filter),
    AppNotification.countDocuments({ recipientType, recipient: recipientId, isRead: false }),
  ]);

  return {
    notifications: rows.map(toPublicAppNotification),
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

async function markNotificationRead(recipientType, recipientId, notificationId) {
  const notification = await AppNotification.findOneAndUpdate(
    { _id: notificationId, recipientType, recipient: recipientId },
    { $set: { isRead: true } },
    { new: true }
  ).lean();

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  return toPublicAppNotification(notification);
}

async function markAllNotificationsRead(recipientType, recipientId) {
  await AppNotification.updateMany(
    { recipientType, recipient: recipientId, isRead: false },
    { $set: { isRead: true } }
  );
}

async function markBroadcastRead(recipientType, recipientId, broadcast) {
  if (!broadcast?._id) return null;
  const broadcastId = String(broadcast._id);
  const notification = await AppNotification.findOneAndUpdate(
    { recipientType, recipient: recipientId, "metadata.broadcastId": broadcastId },
    {
      $set: {
        isRead: true,
        title: "Notification",
        message: String(broadcast.message || "").trim() || "Notification",
        type: "admin_broadcast",
        metadata: {
          source: "admin",
          broadcastId,
          audienceType: broadcast.audienceType || "",
        },
      },
      $setOnInsert: {
        recipientType,
        recipient: recipientId,
      },
    },
    { new: true, upsert: true }
  ).lean();
  return toPublicAppNotification(notification);
}

async function markBroadcastsRead(recipientType, recipientId, broadcasts = []) {
  for (const broadcast of broadcasts) {
    await markBroadcastRead(recipientType, recipientId, broadcast);
  }
}

module.exports = {
  toPublicAppNotification,
  listRecipientNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markBroadcastRead,
  markBroadcastsRead,
};
