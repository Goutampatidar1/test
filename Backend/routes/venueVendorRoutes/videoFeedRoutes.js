const express = require("express");
const videoFeedController = require("../../controllers/venueVendorController.js/videoFeedController");
const { protectVenueVendor } = require("../../middleware/auth");
const { optionalVenueVideoFeedFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.use(protectVenueVendor);

router.get("/venue-video-feeds", videoFeedController.listMyVideoFeeds);
router.post("/venue-video-feed", optionalVenueVideoFeedFiles, videoFeedController.createVideoFeed);
router.patch("/venue-video-feed/:feedId", optionalVenueVideoFeedFiles, videoFeedController.updateVideoFeed);
router.delete("/venue-video-feed/:feedId", videoFeedController.deleteVideoFeed);

module.exports = router;
