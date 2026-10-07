const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const controller = require("../../controllers/adminControllers/hotDealController");

const router = express.Router();

router.use(protectAdmin);

// Conditions
router.get("/rules", controller.listRules);
router.post("/rules", controller.createRule);
router.patch("/rules/:id", controller.updateRule);
router.delete("/rules/:id", controller.deleteRule);

// Vendor opt-in approval queue
router.get("/queue", controller.listQueue);
router.post("/queue/:productId/approve", controller.approveProduct);
router.post("/queue/:productId/reject", controller.rejectProduct);

// What users currently see
router.get("/preview", controller.previewLive);

module.exports = router;
