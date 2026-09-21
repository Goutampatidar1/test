const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalChildCategoryFile } = require("../../middleware/authMultipart");
const childCategoryController = require("../../controllers/adminControllers/childCategoryController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", childCategoryController.listChildCategories);
router.get("/:id", childCategoryController.getChildCategoryById);
router.post("/", optionalChildCategoryFile, childCategoryController.createChildCategory);
router.post("/:id/approve", childCategoryController.approveChildCategory);
router.post("/:id/reject", childCategoryController.rejectChildCategory);
router.patch("/:id", optionalChildCategoryFile, childCategoryController.updateChildCategory);
router.delete("/:id", childCategoryController.deleteChildCategory);

module.exports = router;
