const express = require("express");
const { protectVenueVendor } = require("../../middleware/auth");
const { optionalBannerFile } = require("../../middleware/authMultipart");
const promotionController = require("../../controllers/venueVendorController.js/promotionController");

const router = express.Router();

router.use(protectVenueVendor);

router.get("/promotion-plans", promotionController.listPlans);
router.post("/promotion-plans/subscribe", optionalBannerFile, promotionController.subscribe);
router.post("/promotion-plans/confirm", promotionController.confirmPayment);
router.get("/promotions", promotionController.listMyPromotions);
router.get("/promotions/:id", promotionController.getMyPromotionById);

module.exports = router;
