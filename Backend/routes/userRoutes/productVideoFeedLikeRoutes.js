const express = require("express");
const productVideoFeedLikeController = require("../../controllers/userControllers/productVideoFeedLikeController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.post("/product-video-feed-like/:feedId", productVideoFeedLikeController.toggleVideoFeedLike);

// personal video on/off switch (user app)
const videoSettings = require("../../utils/videoFeatures").makeVideoSettingsHandlers(
  () => require("../../models/entity/user"),
  "user"
);
router.get("/video-settings", videoSettings.get);
router.patch("/video-settings", videoSettings.update);

module.exports = router;
