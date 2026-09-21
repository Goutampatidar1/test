const express = require("express");
const productVideoFeedLikeController = require("../../controllers/userControllers/productVideoFeedLikeController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.post("/product-video-feed-like/:feedId", productVideoFeedLikeController.toggleVideoFeedLike);

module.exports = router;
