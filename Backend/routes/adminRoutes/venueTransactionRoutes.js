const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const venueTransactionController = require("../../controllers/adminControllers/venueTransactionController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", venueTransactionController.listTransactions);
router.get("/:id", venueTransactionController.getTransactionById);
router.post("/", venueTransactionController.createTransaction);
router.patch("/:id", venueTransactionController.updateTransaction);
router.delete("/:id", venueTransactionController.deleteTransaction);

module.exports = router;
