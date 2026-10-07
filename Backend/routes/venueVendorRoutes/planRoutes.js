const express = require("express");
const planController = require("../../controllers/venueVendorController.js/planController");
const { protectVenueVendor } = require("../../middleware/auth");
const { optionalBannerFile } = require("../../middleware/authMultipart");

const router = express.Router();

const { makeRecommendationHandlers, makeDeviceTokenHandlers } = require("../../utils/vendorRecommendations");

const recommendations = makeRecommendationHandlers("venue");
const deviceToken = makeDeviceTokenHandlers(() => require("../../models/entity/venueVendor"));

router.use(protectVenueVendor);
router.get("/recommendations", recommendations.list);
router.put("/device-token", deviceToken.set);
router.post("/device-token", deviceToken.set);
router.delete("/device-token", deviceToken.clear);
router.get("/plans", planController.listPlans);
router.get("/plans/subscriptions", planController.getSubscriptions);
router.get("/plans/banner-subscription", planController.getBannerSubscription);
router.post("/plans/banner-subscription/confirm", planController.confirmBannerPlanPayment);
router.post("/plans/subscriptions/confirm", planController.confirmBannerPlanPayment);
router.post("/plans/:planId/subscribe", planController.subscribeBannerPlan);
router.post("/plans/banner", optionalBannerFile, planController.uploadBanner);
router.delete("/plans/banner", planController.clearBanner);

module.exports = router;
