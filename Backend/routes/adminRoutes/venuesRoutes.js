const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalVenueFiles } = require("../../middleware/authMultipart");
const venueController = require("../../controllers/adminControllers/venueController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", venueController.listVenues);
router.get("/:id", venueController.getVenueById);
router.post("/", optionalVenueFiles, venueController.createVenue);
router.patch("/:id", optionalVenueFiles, venueController.updateVenue);
router.delete("/:id", venueController.deleteVenue);

module.exports = router;
