const express = require("express");
const { protectVenueVendor } = require("../../middleware/auth");
const announcementController = require("../../controllers/venueVendorController.js/announcementController");

const router = express.Router();

router.use(protectVenueVendor);
router.get("/announcements", announcementController.listAnnouncements);

module.exports = router;
