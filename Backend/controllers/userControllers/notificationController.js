const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { sendSuccess } = require("../../utils/apiResponse");
const {
  listRecipientNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../../utils/appNotification");

exports.listNotifications = asyncHandler(async (req, res) => {
  const result = await listRecipientNotifications("user", req.user._id, req.query);

  return sendSuccess(res, "Notifications fetched", {
    items: result.notifications,
    unreadCount: result.unreadCount,
    pagination: result.pagination,
  });
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const notificationId = String(req.params.notificationId || "").trim();
  if (!notificationId) throw new AppError("notificationId is required", 400);
  assertObjectId(notificationId, "Invalid notification id");

  const notification = await markNotificationRead("user", req.user._id, notificationId);
  return sendSuccess(res, "Notification marked as read", notification);
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  await markAllNotificationsRead("user", req.user._id);
  return sendSuccess(res, "All notifications marked as read", { success: true });
});
