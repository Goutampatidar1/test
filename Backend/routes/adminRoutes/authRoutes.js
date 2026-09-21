const express = require("express");
const authController = require("../../controllers/adminControllers/authController");
const { protectAdmin } = require("../../middleware/auth");
const { optionalAdminFile } = require("../../middleware/authMultipart");

const router = express.Router();

router.post("/register", optionalAdminFile, authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", protectAdmin, authController.getMe);
router.patch("/me/password", protectAdmin, authController.changePassword);
router.patch("/me", protectAdmin, optionalAdminFile, authController.updateMe);
router.delete("/me", protectAdmin, authController.deleteMe);

module.exports = router;
