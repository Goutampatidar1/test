const express = require("express");
const profileController = require("../../controllers/vendorControllers/profileController");
const { protectVendor } = require("../../middleware/auth");
const { optionalVendorRegisterFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.get("/", protectVendor, profileController.getProfile);
router.patch("/", protectVendor, optionalVendorRegisterFiles, profileController.updateProfile);
router.get("/shop-status", protectVendor, profileController.getShopStatus);
router.patch("/shop-status", protectVendor, profileController.updateShopStatus);
router.get("/phone-visibility", protectVendor, profileController.getPhoneVisibility);
router.patch("/phone-visibility", protectVendor, profileController.updatePhoneVisibility);

module.exports = router;
