const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalBannerFile } = require("../../middleware/authMultipart");
const bannerController = require("../../controllers/adminControllers/bannerController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", bannerController.listBanners);
router.get("/:id", bannerController.getBannerById);
router.post("/", optionalBannerFile, bannerController.createBanner);
router.patch("/:id", optionalBannerFile, bannerController.updateBanner);
router.delete("/:id", bannerController.deleteBanner);

module.exports = router;
