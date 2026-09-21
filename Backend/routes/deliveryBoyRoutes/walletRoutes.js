const express = require("express");
const { protectDeliveryBoy } = require("../../middleware/auth");
const walletController = require("../../controllers/deliveryBoyControllers/deliveryWalletController");

const router = express.Router();

router.use(protectDeliveryBoy);

router.get("/", walletController.getWallet);
router.get("/cod", walletController.getCodSummary);
router.get("/transactions", walletController.listWalletTransactions);
router.post("/withdraw", walletController.requestWithdrawal);

module.exports = router;
