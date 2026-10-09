const express = require("express");
const { processListingImages } = require("../../middleware/imageQuality");
const productController = require("../../controllers/vendorControllers/productController");
const { protectVendor } = require("../../middleware/auth");
const { optionalVendorProductFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.use(protectVendor);

router.get("/products", productController.listMyProducts);
router.get("/products/mine", productController.listMyProducts);
router.get("/products/:id", productController.getMyProductById);
router.post("/products", optionalVendorProductFiles, processListingImages(), productController.createProduct);
router.patch("/products/status/:id", productController.updateProductStatus);
router.post("/products/:id/hot-deal", productController.setHotDealOptIn);
router.patch("/products/:id/hot-deal", productController.setHotDealOptIn);
router.patch("/products/:id", optionalVendorProductFiles, processListingImages(), productController.updateProduct);
router.delete("/products/:id", productController.deleteProduct);

module.exports = router;
