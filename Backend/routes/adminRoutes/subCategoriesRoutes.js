const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalSubCategoryFile } = require("../../middleware/authMultipart");
const subCategoryController = require("../../controllers/adminControllers/subCategoryController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", subCategoryController.listSubCategories);
router.get("/:id", subCategoryController.getSubCategoryById);
router.post("/", optionalSubCategoryFile, subCategoryController.createSubCategory);
router.post("/:id/approve", subCategoryController.approveSubCategory);
router.post("/:id/reject", subCategoryController.rejectSubCategory);
router.patch("/:id", optionalSubCategoryFile, subCategoryController.updateSubCategory);
router.delete("/:id", subCategoryController.deleteSubCategory);

module.exports = router;
