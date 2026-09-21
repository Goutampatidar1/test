const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const deliveryWithdrawalController = require("../../controllers/adminControllers/deliveryWithdrawalController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", deliveryWithdrawalController.listWithdrawalRequests);
router.get("/:id", deliveryWithdrawalController.getWithdrawalRequestById);
router.patch("/:id", deliveryWithdrawalController.updateWithdrawalRequest);

module.exports = router;
