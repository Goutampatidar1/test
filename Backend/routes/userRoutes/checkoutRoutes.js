const express = require("express");
const checkoutController = require("../../controllers/userControllers/checkoutController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.post("/checkout", checkoutController.checkout);
router.post("/pay-now", checkoutController.payNow);
router.post("/confirm-order-payment/:orderId", checkoutController.confirmOrderPayment);

module.exports = router;
