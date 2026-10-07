const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const controller = require("../../controllers/adminControllers/venueEnquiryController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", controller.listEnquiries);
router.get("/:id", controller.getEnquiry);
router.patch("/:id/status", controller.updateStatus);

module.exports = router;
