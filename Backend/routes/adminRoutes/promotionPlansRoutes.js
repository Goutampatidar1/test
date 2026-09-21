const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const promotionPlanController = require("../../controllers/adminControllers/promotionPlanController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", promotionPlanController.listPlans);
router.get("/:id", promotionPlanController.getPlanById);
router.post("/", promotionPlanController.createPlan);
router.patch("/:id", promotionPlanController.updatePlan);
router.put("/:id", promotionPlanController.updatePlan);
router.delete("/:id", promotionPlanController.deletePlan);

module.exports = router;
