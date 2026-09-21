const express = require("express");
const profileController = require("../../controllers/deliveryBoyControllers/deliveryProfileController");
const { protectDeliveryBoy } = require("../../middleware/auth");
const { optionalDeliveryBoyProfileFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.get("/", protectDeliveryBoy, profileController.getProfile);
router.patch(
  "/",
  protectDeliveryBoy,
  optionalDeliveryBoyProfileFiles,
  profileController.updateProfile
);

module.exports = router;
