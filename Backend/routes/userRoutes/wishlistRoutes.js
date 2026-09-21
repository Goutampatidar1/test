const express = require("express");
const wishlistController = require("../../controllers/userControllers/wishlistController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/wishlist", wishlistController.listWishlist);
router.post("/wishlist/:productId", wishlistController.toggleWishlist);

module.exports = router;
