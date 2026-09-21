const express = require("express");
const authController = require("../../controllers/userControllers/authController");
const { protectUser } = require("../../middleware/auth");
const { optionalUserFile } = require("../../middleware/authMultipart");

const router = express.Router();

router.post("/register", optionalUserFile, authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/check-availability", authController.checkAvailability);
router.post("/otp/send", authController.sendOtp);
router.post("/otp/verify", optionalUserFile, authController.verifyOtp);
router.post("/register/complete", optionalUserFile, authController.completeRegister);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", protectUser, authController.getMe);
router.patch("/me/password", protectUser, authController.changePassword);
router.patch("/me", protectUser, optionalUserFile, authController.updateMe);
router.delete("/me", protectUser, authController.deleteMe);

module.exports = router;
