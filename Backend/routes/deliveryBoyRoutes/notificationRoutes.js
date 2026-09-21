const express = require("express");
const { protectDeliveryBoy } = require("../../middleware/auth");
const notificationController = require("../../controllers/deliveryBoyControllers/deliveryNotificationController");

const router = express.Router();

router.use(protectDeliveryBoy);

router.get("/notifications", notificationController.listNotifications);
router.get("/notifications/read-all", notificationController.markAllNotificationsRead);
router.put("/notifications/read-all", notificationController.markAllNotificationsRead);
router.patch("/notifications/read-all", notificationController.markAllNotificationsRead);
router.post("/notifications/read-all", notificationController.markAllNotificationsRead);
router.patch("/notifications/:notificationId/read", notificationController.markNotificationRead);
router.post("/notifications/:notificationId/read", notificationController.markNotificationRead);

module.exports = router;
