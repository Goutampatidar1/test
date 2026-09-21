const express = require("express");
const catalogController = require("../../controllers/vendorControllers/catalogController");
const locationController = require("../../controllers/vendorControllers/locationController");
const { protectVendor } = require("../../middleware/auth");
const {
  optionalVendorCategoryFile,
  optionalVendorSubCategoryFile,
  optionalVendorChildCategoryFile,
} = require("../../middleware/authMultipart");

const router = express.Router();

router.get("/states", locationController.listStates);
router.get("/cities", locationController.listCities);
router.get("/states/:stateId/cities", locationController.listCities);

router.get("/categories", catalogController.listCategories);
router.get("/categories/mine", protectVendor, catalogController.listMyCategories);
router.get(
  "/categories/product-counts",
  protectVendor,
  catalogController.listMyCategoryProductCounts
);
router.post(
  "/categories",
  protectVendor,
  optionalVendorCategoryFile,
  catalogController.createCategory
);
router.get("/sub-categories", catalogController.listSubCategories);
router.get("/sub-categories/mine", protectVendor, catalogController.listMySubCategories);
router.post(
  "/sub-categories",
  protectVendor,
  optionalVendorSubCategoryFile,
  catalogController.createSubCategory
);
router.get(
  "/categories/:categoryId/sub-categories",
  catalogController.listSubCategories
);
router.get("/child-categories", catalogController.listChildCategories);
router.get("/child-categories/mine", protectVendor, catalogController.listMyChildCategories);
router.post(
  "/child-categories",
  protectVendor,
  optionalVendorChildCategoryFile,
  catalogController.createChildCategory
);
router.get(
  "/sub-categories/:subCategoryId/child-categories",
  catalogController.listChildCategories
);

module.exports = router;
