const express = require("express");
const { processListingImages } = require("../../middleware/imageQuality");
const { protectVenueVendor } = require("../../middleware/auth");
const { optionalVenueFiles } = require("../../middleware/authMultipart");
const { assertOwnVenue } = require("../../middleware/assertOwnVenue");
const venueController = require("../../controllers/adminControllers/venueController");
const discountController = require("../../controllers/venueVendorController.js/discountController");

const router = express.Router();

router.use(protectVenueVendor);

function scopeToVendor(req, _res, next) {
  req.query.addedById = String(req.auth.sub);
  req.query.role = "VenueVendor";
  if (!req.query.limit) req.query.limit = "100";
  next();
}

router.get("/", scopeToVendor, venueController.listVenues);
router.get("/:id/discount", assertOwnVenue, discountController.getDiscount);
router.put("/:id/discount", assertOwnVenue, discountController.setDiscount);
router.patch("/:id/discount", assertOwnVenue, discountController.setDiscount);
router.delete("/:id/discount", assertOwnVenue, discountController.clearDiscount);
router.get("/:id", assertOwnVenue, venueController.getVenueById);
router.post("/", optionalVenueFiles, processListingImages(), venueController.createVenue);
router.patch("/:id", assertOwnVenue, optionalVenueFiles, processListingImages(), venueController.updateVenue);
router.delete("/:id", assertOwnVenue, venueController.deleteVenue);

module.exports = router;
