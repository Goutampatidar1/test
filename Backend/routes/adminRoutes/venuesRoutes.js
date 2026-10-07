const express = require("express");
const { processListingImages } = require("../../middleware/imageQuality");
const { protectAdmin } = require("../../middleware/auth");
const { optionalVenueFiles } = require("../../middleware/authMultipart");
const venueController = require("../../controllers/adminControllers/venueController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", venueController.listVenues);
router.get("/:id", venueController.getVenueById);
router.post("/", optionalVenueFiles, processListingImages(), venueController.createVenue);
router.patch("/:id", optionalVenueFiles, processListingImages(), venueController.updateVenue);
router.delete("/:id", venueController.deleteVenue);

module.exports = router;
