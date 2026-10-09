const express = require("express");
const productVideoFeedController = require("../../controllers/vendorControllers/productVideoFeedController");
const { protectVendor } = require("../../middleware/auth");
const { optionalProductVideoFeedFiles } = require("../../middleware/authMultipart");
const { requireVendorVideoEnabled } = require("../../utils/videoFeatures");

const router = express.Router();

router.use(protectVendor);

router.get("/product-video-feeds", productVideoFeedController.listMyVideoFeeds);
router.get("/video-settings", productVideoFeedController.getVideoSettings);
router.patch("/video-settings", productVideoFeedController.updateVideoSettings);
router.post(
  "/product-video-feed",
  requireVendorVideoEnabled,
  optionalProductVideoFeedFiles,
  productVideoFeedController.createVideoFeed
);
router.patch(
  "/product-video-feed/:feedId",
  requireVendorVideoEnabled,
  optionalProductVideoFeedFiles,
  productVideoFeedController.updateVideoFeed
);
router.delete("/product-video-feed/:feedId", productVideoFeedController.deleteVideoFeed);

module.exports = router;
