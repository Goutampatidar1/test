const express = require("express");
const { protectVenueVendor } = require("../../middleware/auth");
const bookingController = require("../../controllers/venueVendorController.js/bookingController");

const router = express.Router();

router.use(protectVenueVendor);

router.get("/dashboard", bookingController.getDashboard);
router.get("/", bookingController.listBookings);
router.get("/:id/invoice", bookingController.getBookingInvoice);
router.get("/:id", bookingController.getBookingById);
router.patch("/:id/status", bookingController.updateBookingStatus);

module.exports = router;
