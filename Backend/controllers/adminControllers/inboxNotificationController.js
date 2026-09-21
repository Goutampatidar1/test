const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const {
  listRecipientNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../../utils/appNotification");

exports.listInboxNotifications = asyncHandler(async (req, res) => {
  const result = await listRecipientNotifications("admin", req.auth.sub, req.query);
  res.json({
    notifications: result.notifications,
    unreadCount: result.unreadCount,
    pagination: result.pagination,
  });
});

exports.markInboxNotificationRead = asyncHandler(async (req, res) => {
  const notificationId = String(req.params.notificationId || "").trim();
  if (!notificationId) throw new AppError("notificationId is required", 400);
  assertObjectId(notificationId, "Invalid notification id");

  const notification = await markNotificationRead("admin", req.auth.sub, notificationId);
  res.json({ notification });
});

exports.markAllInboxNotificationsRead = asyncHandler(async (req, res) => {
  await markAllNotificationsRead("admin", req.auth.sub);
  res.json({ success: true });
});
