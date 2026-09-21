const express = require("express");
const productRatingController = require("../../controllers/userControllers/productRatingController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

// Preferred mobile routes
router.get("/product-review/:productId", productRatingController.getMyProductReview);
router.post("/product-review/:productId", productRatingController.createProductReview);
router.put("/product-review/:productId", productRatingController.updateProductReview);
router.patch("/product-review/:productId", productRatingController.updateProductReview);
router.delete("/product-review/:productId", productRatingController.deleteMyProductReview);

// Legacy aliases
router.get("/product-rating/:productId", productRatingController.getMyProductRating);
router.post("/product-rating/:productId", productRatingController.submitProductRating);
router.delete("/product-rating/:productId", productRatingController.deleteMyProductRating);

module.exports = router;
