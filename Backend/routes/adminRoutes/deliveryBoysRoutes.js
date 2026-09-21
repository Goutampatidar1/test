const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalDeliveryBoyFiles } = require("../../middleware/authMultipart");
const deliveryBoyController = require("../../controllers/adminControllers/deliveryBoyController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", deliveryBoyController.listDeliveryBoys);
router.get("/:id", deliveryBoyController.getDeliveryBoyById);
router.post("/", optionalDeliveryBoyFiles, deliveryBoyController.createDeliveryBoy);
router.patch(
  "/:id",
  optionalDeliveryBoyFiles,
  deliveryBoyController.updateDeliveryBoy
);
router.delete("/:id", deliveryBoyController.deleteDeliveryBoy);

module.exports = router;
