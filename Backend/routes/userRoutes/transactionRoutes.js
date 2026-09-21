const express = require("express");
const transactionHistoryController = require("../../controllers/userControllers/transactionHistoryController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/transaction-history", transactionHistoryController.listTransactionHistory);

module.exports = router;
