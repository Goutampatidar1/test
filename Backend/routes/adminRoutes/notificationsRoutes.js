const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalNotificationFile } = require("../../middleware/authMultipart");
const notificationController = require("../../controllers/adminControllers/notificationController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", notificationController.listNotifications);
router.get("/:id", notificationController.getNotificationById);
router.post("/", optionalNotificationFile, notificationController.createNotification);
router.patch("/:id", optionalNotificationFile, notificationController.updateNotification);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;
