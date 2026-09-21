const express = require("express");
const venueRatingController = require("../../controllers/userControllers/venueRatingController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/venue-review/:bookingId", venueRatingController.getMyVenueReview);
router.post("/venue-review/:bookingId", venueRatingController.createVenueReview);
router.put("/venue-review/:bookingId", venueRatingController.updateVenueReview);
router.patch("/venue-review/:bookingId", venueRatingController.updateVenueReview);
router.delete("/venue-review/:bookingId", venueRatingController.deleteMyVenueReview);

router.get("/venue-rating/:bookingId", venueRatingController.getMyVenueRating);
router.post("/venue-rating/:bookingId", venueRatingController.submitVenueRating);
router.delete("/venue-rating/:bookingId", venueRatingController.deleteMyVenueRating);

module.exports = router;
