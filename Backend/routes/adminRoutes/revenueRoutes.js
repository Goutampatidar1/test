const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const revenueController = require("../../controllers/adminControllers/revenueController");

const router = express.Router();

router.use(protectAdmin);

router.get("/revenue", revenueController.listRevenueHistory);

module.exports = router;
