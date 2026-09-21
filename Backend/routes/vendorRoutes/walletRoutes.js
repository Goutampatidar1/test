const express = require("express");
const { protectVendor } = require("../../middleware/auth");
const walletController = require("../../controllers/vendorControllers/walletController");

const router = express.Router();

router.use(protectVendor);

router.get("/", walletController.getWallet);
router.get("/balance", walletController.getBalance);
router.get("/transactions", walletController.listWalletTransactions);
router.post("/withdraw", walletController.requestWithdrawal);

module.exports = router;
