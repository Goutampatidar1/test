const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const venueOrderController = require("../../controllers/adminControllers/venueOrderController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", venueOrderController.listOrders);
router.get("/:id", venueOrderController.getOrderById);
router.post("/", venueOrderController.createOrder);
router.patch("/:id", venueOrderController.updateOrder);
router.delete("/:id", venueOrderController.deleteOrder);

module.exports = router;
