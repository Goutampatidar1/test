const express = require("express");
const { protectVenueVendor } = require("../../middleware/auth");
const { optionalVenueFiles } = require("../../middleware/authMultipart");
const { assertOwnVenue } = require("../../middleware/assertOwnVenue");
const venueController = require("../../controllers/adminControllers/venueController");

const router = express.Router();

router.use(protectVenueVendor);

function scopeToVendor(req, _res, next) {
  req.query.addedById = String(req.auth.sub);
  req.query.role = "VenueVendor";
  if (!req.query.limit) req.query.limit = "100";
  next();
}

router.get("/", scopeToVendor, venueController.listVenues);
router.get("/:id", assertOwnVenue, venueController.getVenueById);
router.post("/", optionalVenueFiles, venueController.createVenue);
router.patch("/:id", assertOwnVenue, optionalVenueFiles, venueController.updateVenue);
router.delete("/:id", assertOwnVenue, venueController.deleteVenue);

module.exports = router;
