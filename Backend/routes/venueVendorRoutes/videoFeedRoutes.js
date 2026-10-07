const express = require("express");
const videoFeedController = require("../../controllers/venueVendorController.js/videoFeedController");
const { protectVenueVendor } = require("../../middleware/auth");
const { optionalVenueVideoFeedFiles } = require("../../middleware/authMultipart");
const { requireVendorVideoEnabled } = require("../../utils/videoFeatures");

const router = express.Router();

router.use(protectVenueVendor);

router.get("/venue-video-feeds", videoFeedController.listMyVideoFeeds);
router.get("/video-settings", videoFeedController.getVideoSettings);
router.patch("/video-settings", videoFeedController.updateVideoSettings);
router.post(
  "/venue-video-feed",
  requireVendorVideoEnabled,
  optionalVenueVideoFeedFiles,
  videoFeedController.createVideoFeed
);
router.patch(
  "/venue-video-feed/:feedId",
  requireVendorVideoEnabled,
  optionalVenueVideoFeedFiles,
  videoFeedController.updateVideoFeed
);
router.delete("/venue-video-feed/:feedId", videoFeedController.deleteVideoFeed);

module.exports = router;
