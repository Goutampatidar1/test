const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const rechargeController = require("../../controllers/adminControllers/rechargeController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", rechargeController.listRecharges);
router.get("/transactions/:id", rechargeController.getRechargeTransactionById);
router.get("/transactions", rechargeController.listRechargeTransactions);
router.post("/", rechargeController.createRecharge);

module.exports = router;
