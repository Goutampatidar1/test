const express = require("express");
const notificationController = require("../../controllers/userControllers/notificationController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.get("/notifications", protectUser, notificationController.listNotifications);
router.patch("/notifications/read-all", protectUser, notificationController.markAllNotificationsRead);
router.post("/notifications/read-all", protectUser, notificationController.markAllNotificationsRead);
router.patch("/notifications/:notificationId/read", protectUser, notificationController.markNotificationRead);
router.post("/notifications/:notificationId/read", protectUser, notificationController.markNotificationRead);

module.exports = router;
