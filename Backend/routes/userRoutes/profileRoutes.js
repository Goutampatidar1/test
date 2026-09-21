const express = require("express");
const authController = require("../../controllers/userControllers/authController");
const walletController = require("../../controllers/userControllers/walletController");
const { protectUser } = require("../../middleware/auth");
const { optionalUserFile } = require("../../middleware/authMultipart");

const router = express.Router();

router.get("/me", protectUser, authController.getMe);
router.patch("/me/password", protectUser, authController.changePassword);
router.patch("/me", protectUser, optionalUserFile, authController.updateMe);
router.delete("/me", protectUser, authController.deleteMe);
router.get("/wallet", protectUser, walletController.getWallet);
router.get("/wallet/transactions", protectUser, walletController.listWalletTransactions);
router.get("/wallet-transactions", protectUser, walletController.listWalletTransactions);
router.post("/wallet/add", protectUser, walletController.addWalletAmount);

module.exports = router;
