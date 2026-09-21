const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalVenueVendorFiles } = require("../../middleware/authMultipart");
const venueVendorController = require("../../controllers/adminControllers/venueVendorController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", venueVendorController.listVenueVendors);
router.get("/:id", venueVendorController.getVenueVendorById);
router.post("/", optionalVenueVendorFiles, venueVendorController.createVenueVendor);
router.patch("/:id", optionalVenueVendorFiles, venueVendorController.updateVenueVendor);
router.delete("/:id", venueVendorController.deleteVenueVendor);

module.exports = router;
