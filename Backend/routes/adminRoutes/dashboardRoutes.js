const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const dashboardController = require("../../controllers/adminControllers/dashboardController");

const router = express.Router();

router.use(protectAdmin);

router.get("/stats", dashboardController.getStats);

module.exports = router;
