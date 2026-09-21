const express = require("express");
const orderController = require("../../controllers/vendorControllers/orderController");
const { protectVendor } = require("../../middleware/auth");

const router = express.Router();

router.use(protectVendor);

router.get("/home", orderController.getHome);
router.get("/dashboard", orderController.getHome);
router.get("/orders", orderController.listOrders);
router.get("/orders/:orderId/invoice", orderController.getOrderInvoice);
router.get("/orders/:orderId", orderController.getOrderDetail);
router.post("/orders/:orderId/accept", orderController.acceptOrder);
router.post("/orders/:orderId/reject", orderController.rejectOrder);
router.post("/orders/:orderId/processing", orderController.markProcessing);
router.post("/orders/:orderId/out-for-delivery", orderController.markOutForDelivery);
router.patch("/orders/:orderId/status", orderController.updateOrderStatus);
router.post("/orders/:orderId/status", orderController.updateOrderStatus);

module.exports = router;
