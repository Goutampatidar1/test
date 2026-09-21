const express = require("express");
const shippingAddressController = require("../../controllers/userControllers/shippingAddressController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/shipping-addresses", shippingAddressController.listShippingAddresses);
router.get("/shipping-address/:addressId", shippingAddressController.getShippingAddress);
router.get("/shipping-address", shippingAddressController.getShippingAddress);
router.post("/shipping-address", shippingAddressController.addShippingAddress);
router.put("/shipping-address/:addressId", shippingAddressController.updateShippingAddress);
router.put("/shipping-address", shippingAddressController.updateShippingAddress);
router.patch("/shipping-address/:addressId", shippingAddressController.updateShippingAddress);
router.patch("/shipping-address", shippingAddressController.updateShippingAddress);
router.delete("/shipping-address/:addressId", shippingAddressController.deleteShippingAddress);
router.delete("/shipping-address", shippingAddressController.deleteShippingAddress);

module.exports = router;
