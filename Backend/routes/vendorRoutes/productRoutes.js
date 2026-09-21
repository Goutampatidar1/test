const express = require("express");
const productController = require("../../controllers/vendorControllers/productController");
const { protectVendor } = require("../../middleware/auth");
const { optionalVendorProductFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.use(protectVendor);

router.get("/products", productController.listMyProducts);
router.get("/products/mine", productController.listMyProducts);
router.get("/products/:id", productController.getMyProductById);
router.post("/products", optionalVendorProductFiles, productController.createProduct);
router.patch("/products/status/:id", productController.updateProductStatus);
router.patch("/products/:id", optionalVendorProductFiles, productController.updateProduct);
router.delete("/products/:id", productController.deleteProduct);

module.exports = router;
