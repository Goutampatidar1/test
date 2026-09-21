const express = require("express");
const authController = require("../../controllers/vendorPanelController/authController");
const { optionalVendorRegisterFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.post("/register", optionalVendorRegisterFiles, authController.register);
router.post("/otp/send", authController.sendOtp);
router.post("/otp/verify", authController.verifyOtp);
router.post("/refresh", authController.refresh);

module.exports = router;
