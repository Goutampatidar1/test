const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const ecomTransactionController = require("../../controllers/adminControllers/ecomTransactionController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", ecomTransactionController.listTransactions);
router.get("/:id", ecomTransactionController.getTransactionById);
router.post("/", ecomTransactionController.createTransaction);
router.patch("/:id", ecomTransactionController.updateTransaction);
router.delete("/:id", ecomTransactionController.deleteTransaction);

module.exports = router;
