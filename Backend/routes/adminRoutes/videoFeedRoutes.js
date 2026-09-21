const express = require("express");
const videoFeedController = require("../../controllers/adminControllers/videoFeedController");
const { protectAdmin } = require("../../middleware/auth");
const { optionalAdminVideoFeedFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.use(protectAdmin);

router.get("/", videoFeedController.listVideoFeeds);
router.post("/", optionalAdminVideoFeedFiles, videoFeedController.createVideoFeed);
router.patch("/:feedId", optionalAdminVideoFeedFiles, videoFeedController.updateVideoFeed);
router.delete("/:feedId", videoFeedController.deleteVideoFeed);

module.exports = router;
