const express = require("express");
const productVideoFeedController = require("../../controllers/vendorControllers/productVideoFeedController");
const { protectVendor } = require("../../middleware/auth");
const { optionalProductVideoFeedFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.use(protectVendor);

router.get("/product-video-feeds", productVideoFeedController.listMyVideoFeeds);
router.post("/product-video-feed", optionalProductVideoFeedFiles, productVideoFeedController.createVideoFeed);
router.patch("/product-video-feed/:feedId", optionalProductVideoFeedFiles, productVideoFeedController.updateVideoFeed);
router.delete("/product-video-feed/:feedId", productVideoFeedController.deleteVideoFeed);

module.exports = router;
