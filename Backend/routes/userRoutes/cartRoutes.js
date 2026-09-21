const express = require("express");
const cartController = require("../../controllers/userControllers/cartController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/cart", cartController.listCart);
router.get("/cart-item/:productId", cartController.getCartItemState);

// One API for add / + / − — send final quantity in body
router.post("/cart-add/:productId", cartController.addToCart);

// cart-increase / cart-decrease: +1 / -1 by default; optional body.quantity sets final qty
router.post("/cart-increase/:productId", cartController.increaseCartQuantity);
router.post("/cart-decrease/:productId", cartController.decreaseCartQuantity);

router.delete("/cart-remove/:productId", cartController.removeFromCart);
router.delete("/cart-remove", cartController.removeFromCart);

module.exports = router;
