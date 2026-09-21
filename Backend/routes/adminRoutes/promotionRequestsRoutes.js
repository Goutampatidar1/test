const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const promotionRequestController = require("../../controllers/adminControllers/promotionRequestController");

const router = express.Router();

router.use(protectAdmin);

router.get("/dashboard", promotionRequestController.getDashboard);
router.get("/", promotionRequestController.listRequests);
router.get("/:id", promotionRequestController.getRequestById);
router.patch("/:id/approve", promotionRequestController.approveRequest);
router.post("/:id/approve", promotionRequestController.approveRequest);
router.patch("/:id/reject", promotionRequestController.rejectRequest);
router.post("/:id/reject", promotionRequestController.rejectRequest);

module.exports = router;
