const express = require("express");
const authController = require("../../controllers/deliveryBoyControllers/authController");
const { protectDeliveryBoy } = require("../../middleware/auth");
const { optionalDeliveryBoyFiles, optionalDeliveryBoyProfileFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.post("/register", optionalDeliveryBoyFiles, authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/forgot-password/otp/send", authController.sendForgotPasswordOtp);
router.post("/forgot-password/otp/verify", authController.verifyForgotPasswordOtp);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.patch("/me/password", protectDeliveryBoy, authController.changePassword);
router.get("/me", protectDeliveryBoy, authController.getMe);
router.patch(
  "/me",
  protectDeliveryBoy,
  optionalDeliveryBoyProfileFiles,
  authController.updateMe
);
router.delete("/me", protectDeliveryBoy, authController.deleteMe);

module.exports = router;
