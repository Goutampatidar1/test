const express = require("express");
const { protectDeliveryBoy } = require("../../middleware/auth");
const orderController = require("../../controllers/deliveryBoyControllers/deliveryOrderController");

const router = express.Router();

router.use(protectDeliveryBoy);

router.get("/", orderController.listOrders);
router.get("/:orderId", orderController.getOrderDetail);
router.post("/:orderId/accept", orderController.acceptOrder);
router.post("/:orderId/reject", orderController.rejectOrder);
router.post("/:orderId/delivered", orderController.markDelivered);

module.exports = router;
