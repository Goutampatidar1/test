const express = require("express");
const notificationController = require("../../controllers/vendorControllers/notificationController");
const { protectVendor } = require("../../middleware/auth");

const router = express.Router();

router.use(protectVendor);

router.get("/notifications", notificationController.listNotifications);
router.get("/notifications/read-all", notificationController.markAllNotificationsRead);
router.put("/notifications/read-all", notificationController.markAllNotificationsRead);
router.patch("/notifications/read-all", notificationController.markAllNotificationsRead);
router.post("/notifications/read-all", notificationController.markAllNotificationsRead);
router.patch("/notifications/:notificationId/read", notificationController.markNotificationRead);
router.post("/notifications/:notificationId/read", notificationController.markNotificationRead);

module.exports = router;
