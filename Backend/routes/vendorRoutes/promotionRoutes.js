const express = require("express");
const { protectVendor } = require("../../middleware/auth");
const { optionalBannerFile } = require("../../middleware/authMultipart");
const promotionController = require("../../controllers/vendorControllers/promotionController");

const router = express.Router();

router.use(protectVendor);

router.get("/promotion-plans", promotionController.listPlans);
router.post("/promotion-plans/subscribe", optionalBannerFile, promotionController.subscribe);
router.post("/promotion-plans/confirm", promotionController.confirmPayment);

router.get("/promotions", promotionController.listMyPromotions);
router.get("/promotions/:id", promotionController.getMyPromotionById);

/** Spec path: purchase history under /plans (does not change GET /plans) */
router.get("/plans/purchase-history", promotionController.purchaseHistory);

module.exports = router;
