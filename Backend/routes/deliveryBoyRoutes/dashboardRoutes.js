const express = require("express");
const { protectDeliveryBoy } = require("../../middleware/auth");
const dashboardController = require("../../controllers/deliveryBoyControllers/deliveryDashboardController");

const router = express.Router();

router.use(protectDeliveryBoy);

router.get("/home", dashboardController.getHome);
router.get("/dashboard", dashboardController.getHome);

module.exports = router;
