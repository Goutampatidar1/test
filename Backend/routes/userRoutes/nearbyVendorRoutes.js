const express = require("express");
const nearbyVendorController = require("../../controllers/userControllers/nearbyVendorController");
const { optionalProtectUser } = require("../../middleware/auth");

const router = express.Router();

router.get("/nearby-vendors", optionalProtectUser, nearbyVendorController.listNearbyVendors);
router.get("/vendors", optionalProtectUser, nearbyVendorController.listAllVendors);
router.get("/vendors/all", optionalProtectUser, nearbyVendorController.listAllVendors);

module.exports = router;
