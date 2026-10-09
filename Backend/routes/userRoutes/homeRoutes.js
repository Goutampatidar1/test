const express = require("express");
const homeController = require("../../controllers/userControllers/userHomeController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.get("/area", protectUser, homeController.getArea);
router.put("/area", protectUser, homeController.setArea);
router.patch("/area", protectUser, homeController.setArea);
router.get("/recently-viewed", protectUser, homeController.listRecentlyViewed);
router.post("/recently-viewed", protectUser, homeController.recordRecentlyViewed);
router.get("/suggestions", protectUser, homeController.listSuggestions);

module.exports = router;
