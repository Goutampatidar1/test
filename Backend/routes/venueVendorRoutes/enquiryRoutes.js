const express = require("express");
const { protectVenueVendor } = require("../../middleware/auth");
const enquiryController = require("../../controllers/venueVendorController.js/enquiryController");

const router = express.Router();

router.use(protectVenueVendor);

router.get("/", enquiryController.listEnquiries);
router.post("/mark-seen", enquiryController.markSegmentSeen);
router.get("/:id", enquiryController.getEnquiry);
router.post("/:id/mark-read", enquiryController.markEnquiryRead);
router.post("/:id/accept", enquiryController.acceptEnquiry);
router.post("/:id/reject", enquiryController.rejectEnquiry);
router.patch("/:id/note", enquiryController.updateNote);

module.exports = router;
