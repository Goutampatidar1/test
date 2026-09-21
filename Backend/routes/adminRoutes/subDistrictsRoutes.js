const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const subDistrictController = require("../../controllers/adminControllers/subDistrictController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", subDistrictController.listSubDistricts);
router.get("/:id", subDistrictController.getSubDistrictById);
router.post("/", subDistrictController.createSubDistrict);
router.patch("/:id", subDistrictController.updateSubDistrict);
router.delete("/:id", subDistrictController.deleteSubDistrict);

module.exports = router;
