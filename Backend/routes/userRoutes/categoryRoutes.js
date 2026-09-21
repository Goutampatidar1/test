const express = require("express");
const categoryController = require("../../controllers/userControllers/categoryController");
const { optionalProtectUser } = require("../../middleware/auth");

const router = express.Router();

router.get("/categories", categoryController.listCategories);
router.get("/category/:categoryId", categoryController.getCategoryDetail);
router.get("/child-categories", categoryController.listChildCategories);
router.get("/sub-categories/:categoryId", categoryController.listSubCategories);

// Products by sub-category (Footwear, Upper Wear, etc.)
router.get(
  "/products/sub-category/:subCategoryId",
  optionalProtectUser,
  categoryController.listSubCategoryProducts
);
router.get(
  "/sub-category/:subCategoryId/products",
  optionalProtectUser,
  categoryController.listSubCategoryProducts
);
router.get(
  "/sub-category-products/:subCategoryId",
  optionalProtectUser,
  categoryController.listSubCategoryProducts
);

module.exports = router;
