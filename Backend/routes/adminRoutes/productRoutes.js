const express = require("express");
const { processListingImages } = require("../../middleware/imageQuality");
const { protectAdmin } = require("../../middleware/auth");
const { optionalProductFiles } = require("../../middleware/authMultipart");
const productController = require("../../controllers/adminControllers/productController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", productController.listProducts);
router.get("/:id", productController.getProductById);
router.post("/", optionalProductFiles, processListingImages(), productController.createProduct);
router.post("/:id/approve", productController.approveProduct);
router.post("/:id/reject", productController.rejectProduct);
router.patch("/:id", optionalProductFiles, processListingImages(), productController.updateProduct);
router.delete("/:id", productController.deleteProduct);

module.exports = router;
