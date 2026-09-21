const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalPromotionFile } = require("../../middleware/authMultipart");
const promotionController = require("../../controllers/adminControllers/promotionController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", promotionController.listPromotions);
router.get("/:id", promotionController.getPromotionById);
router.post("/", optionalPromotionFile, promotionController.createPromotion);
router.patch("/:id", optionalPromotionFile, promotionController.updatePromotion);
router.delete("/:id", promotionController.deletePromotion);

module.exports = router;
