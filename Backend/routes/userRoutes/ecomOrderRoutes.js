const express = require("express");
const ecomOrderController = require("../../controllers/userControllers/ecomOrderController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/order-history", ecomOrderController.listOrderHistory);
router.get("/orders/history", ecomOrderController.listOrderHistory);
router.get("/order/:orderId", ecomOrderController.getOrderDetail);
router.get("/track-order/:orderId", ecomOrderController.trackOrder);
router.post("/order-cancel/:orderId", ecomOrderController.cancelOrder);
router.get("/order-invoice/:orderId", ecomOrderController.getOrderInvoice);

module.exports = router;
