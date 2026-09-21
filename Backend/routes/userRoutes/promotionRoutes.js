const express = require("express");
const { optionalProtectUser } = require("../../middleware/auth");
const userPromotionController = require("../../controllers/userControllers/userPromotionController");

const router = express.Router();

router.get("/promotional-banners", optionalProtectUser, userPromotionController.listPromotionalBanners);
router.get("/verified-vendors", optionalProtectUser, userPromotionController.listVerifiedVendors);
router.get("/promoted-products", optionalProtectUser, userPromotionController.listPromotedProducts);

module.exports = router;
