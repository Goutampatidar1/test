const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const vendorWithdrawalController = require("../../controllers/adminControllers/vendorWithdrawalController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", vendorWithdrawalController.listWithdrawalRequests);
router.get("/:id", vendorWithdrawalController.getWithdrawalRequestById);
router.patch("/:id", vendorWithdrawalController.updateWithdrawalRequest);

module.exports = router;
