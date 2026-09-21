const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const vendorPlanController = require("../../controllers/adminControllers/vendorPlanController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", vendorPlanController.listPlans);
router.get("/:id", vendorPlanController.getPlanById);
router.post("/", vendorPlanController.createPlan);
router.patch("/:id", vendorPlanController.updatePlan);
router.delete("/:id", vendorPlanController.deletePlan);

module.exports = router;
