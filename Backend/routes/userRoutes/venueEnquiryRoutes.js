const express = require("express");
const controller = require("../../controllers/userControllers/venueEnquiryController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

// Create (venue id at the end, same style as venue-booking)
router.post("/venue-enquiry/:venueId", controller.createVenueEnquiry);
router.post("/venue-enquiry/:venueId/quick", controller.createQuickEnquiry);

// Own enquiries
router.get("/enquiries", controller.listMyEnquiries);
router.get("/enquiries/:id", controller.getMyEnquiry);
router.post("/enquiries/:id/cancel", controller.cancelMyEnquiry);
router.get("/enquiries/:id/booking-preview", controller.getEnquiryBookingPreview);
router.post("/enquiries/:id/book", controller.bookFromEnquiry);

module.exports = router;
