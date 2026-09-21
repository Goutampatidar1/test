const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const inboxNotificationController = require("../../controllers/adminControllers/inboxNotificationController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", inboxNotificationController.listInboxNotifications);
router.patch("/read-all", inboxNotificationController.markAllInboxNotificationsRead);
router.patch("/:notificationId/read", inboxNotificationController.markInboxNotificationRead);

module.exports = router;
