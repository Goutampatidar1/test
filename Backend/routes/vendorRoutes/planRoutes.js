const express = require("express");
const planController = require("../../controllers/vendorControllers/planController");
const { protectVendor } = require("../../middleware/auth");
const { optionalBannerFile } = require("../../middleware/authMultipart");

const router = express.Router();

router.use(protectVendor);
router.get("/plans", planController.listPlans);
router.get("/plans/subscriptions", planController.getSubscriptions);
router.get("/plans/banner-subscription", planController.getBannerSubscription);
router.post("/plans/banner-subscription/confirm", planController.confirmBannerPlanPayment);
router.post("/plans/subscriptions/confirm", planController.confirmBannerPlanPayment);
router.post("/plans/:planId/subscribe", planController.subscribeBannerPlan);
router.post("/plans/banner", optionalBannerFile, planController.uploadBanner);
router.delete("/plans/banner", planController.clearBanner);
router.post("/plans/presence/featured-product", planController.setFeaturedProduct);
router.put("/plans/presence/featured-product", planController.setFeaturedProduct);

module.exports = router;
