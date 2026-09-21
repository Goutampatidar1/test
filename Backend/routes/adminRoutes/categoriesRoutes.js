const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalCategoryFile } = require("../../middleware/authMultipart");
const categoryController = require("../../controllers/adminControllers/categoryController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", categoryController.listCategories);
router.get("/:id", categoryController.getCategoryById);
router.post("/", optionalCategoryFile, categoryController.createCategory);
router.post("/:id/approve", categoryController.approveCategory);
router.post("/:id/reject", categoryController.rejectCategory);
router.patch("/:id", optionalCategoryFile, categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;
