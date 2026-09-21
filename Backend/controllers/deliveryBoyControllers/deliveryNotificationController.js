const Notification = require("../../models/other/notification");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl, toAbsoluteUploadUrl } = require("../../utils/mediaUrl");
const {
  listRecipientNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markBroadcastRead,
  markBroadcastsRead,
} = require("../../utils/appNotification");

function toPublicBroadcast(doc, baseUrl) {
  if (!doc) return null;
  return {
    _id: doc._id,
    type: "admin_broadcast",
    title: "Notification",
    message: doc.message || "",
    image: toAbsoluteUploadUrl(doc.image || "", baseUrl) || "",
    orderId: null,
    orderNumber: "",
    orderStatus: "",
    linkPath: "",
    isRead: false,
    metadata: { source: "admin", audienceType: "deliveryPartners", broadcastId: String(doc._id) },
    createdAt: doc.sentAt || doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

exports.listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const baseUrl = getPublicBaseUrl(req);
  const unreadOnly = String(req.query.unreadOnly || req.query.unread || "").toLowerCase() === "true";

  const [inbox, broadcasts] = await Promise.all([
    listRecipientNotifications("deliveryBoy", req.user._id, { page: 1, limit: 100 }),
    Notification.find({
      audienceType: "deliveryPartners",
      status: "active",
      kind: { $ne: "announcement" },
    })
      .sort({ sentAt: -1, createdAt: -1 })
      .lean(),
  ]);

  const alreadySent = new Set(
    inbox.notifications
      .map((row) => String(row.metadata?.broadcastId || ""))
      .filter(Boolean)
  );

  const items = [
    ...inbox.notifications,
    ...broadcasts.filter((row) => !alreadySent.has(String(row._id))).map((row) => toPublicBroadcast(row, baseUrl)),
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const visible = unreadOnly ? items.filter((row) => !row.isRead) : items;
  const paged = visible.slice(skip, skip + limit);
  const extraUnread = broadcasts.filter((row) => !alreadySent.has(String(row._id))).length;

  return res.status(200).json({
    status: paged.length > 0,
    message: "Notifications fetched",
    data: paged,
    unreadCount: inbox.unreadCount + extraUnread,
    pagination: {
      page,
      limit,
      total: visible.length,
      pages: Math.ceil(visible.length / limit) || 1,
    },
  });
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const notificationId = String(req.params.notificationId || "").trim();
  if (!notificationId) throw new AppError("notificationId is required", 400);
  assertObjectId(notificationId, "Invalid notification id");

  try {
    const notification = await markNotificationRead("deliveryBoy", req.user._id, notificationId);
    return res.status(200).json({
      status: true,
      message: "Notification marked as read",
      data: [notification],
    });
  } catch (error) {
    if (error?.statusCode !== 404) throw error;
  }

  const broadcast = await Notification.findOne({
    _id: notificationId,
    audienceType: "deliveryPartners",
  }).lean();
  if (!broadcast) throw new AppError("Notification not found", 404);

  const item = await markBroadcastRead("deliveryBoy", req.user._id, broadcast);
  return res.status(200).json({
    status: true,
    message: "Notification marked as read",
    data: [item],
  });
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  const broadcasts = await Notification.find({
    audienceType: "deliveryPartners",
    status: "active",
    kind: { $ne: "announcement" },
  })
    .select("_id message audienceType")
    .lean();

  await markAllNotificationsRead("deliveryBoy", req.user._id);
  await markBroadcastsRead("deliveryBoy", req.user._id, broadcasts);

  return res.status(200).json({
    status: true,
    message: "All notifications marked as read",
    data: [{ success: true, unreadCount: 0 }],
    unreadCount: 0,
  });
});
