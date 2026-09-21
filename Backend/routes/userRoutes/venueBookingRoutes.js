const express = require("express");
const venueBookingController = require("../../controllers/userControllers/venueBookingController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/booking-history", venueBookingController.getBookingHistory);
router.get("/venue-bookings", venueBookingController.listMyBookings);
router.post("/cancel-booking/:bookingId", venueBookingController.cancelBooking);
router.post("/confirm-booking-payment/:bookingId", venueBookingController.confirmBookingPayment);
router.post("/confirm-booking-balance/:bookingId", venueBookingController.confirmBookingPayment);
router.get("/booking-detail/:bookingId", venueBookingController.getMyBookingById);
router.get("/booking-invoice/:bookingId", venueBookingController.getBookingInvoice);

// Legacy
router.post("/venue-bookings/:id/cancel", venueBookingController.cancelBooking);
router.post("/venue-bookings/:id/confirm-payment", venueBookingController.confirmBookingPayment);
router.get("/venue-bookings/:id", venueBookingController.getMyBookingById);
router.get("/venue-bookings/:id/invoice", venueBookingController.getBookingInvoice);

// Venue id at end of path (preferred for mobile)
router.get("/venue-availability/:venueId", venueBookingController.checkVenueAvailability);
router.post("/venue-availability/:venueId", venueBookingController.checkVenueAvailability);
router.get("/check-venue-availability/:venueId", venueBookingController.checkVenueAvailability);
router.post("/check-venue-availability/:venueId", venueBookingController.checkVenueAvailability);
router.get("/venue-booking/:venueId", venueBookingController.getBookingPreview);
router.post("/venue-booking/:venueId", venueBookingController.createBooking);

// Legacy — id between /venues/ and /booking
router.get("/venues/:venueId/booking", venueBookingController.getBookingPreview);
router.post("/venues/:venueId/booking", venueBookingController.createBooking);

module.exports = router;
