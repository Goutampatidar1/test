const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const driverCodController = require("../../controllers/adminControllers/driverCodController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", driverCodController.listDriversCod);
router.get("/:driverId/pending-orders", driverCodController.listDriverPendingOrders);
router.get("/:driverId/settlements", driverCodController.listDriverSettlements);
router.post("/:driverId/settle", driverCodController.settleDriverCod);
router.get("/:driverId", driverCodController.getDriverCodDetail);

module.exports = router;
