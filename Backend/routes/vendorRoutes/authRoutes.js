const express = require("express");
const authController = require("../../controllers/vendorControllers/authController");
const { protectVendor } = require("../../middleware/auth");
const {
  optionalVendorFile,
  optionalVendorRegisterFiles,
} = require("../../middleware/authMultipart");

const router = express.Router();

// Mobile app (OTP + multi-step register)
router.post("/otp/send", authController.sendOtp);
router.post("/otp/verify", authController.verifyOtp);
router.post("/register/complete", optionalVendorRegisterFiles, authController.completeRegister);
router.post("/check-availability", authController.checkAvailability);
router.post("/refresh", authController.refresh);

// Legacy / web email-password
router.post("/register", optionalVendorFile, authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", protectVendor, authController.getMe);
router.patch("/me", protectVendor, optionalVendorFile, authController.updateMe);
router.delete("/me", protectVendor, authController.deleteMe);

module.exports = router;
