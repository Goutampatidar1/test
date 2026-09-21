const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalVendorFiles } = require("../../middleware/authMultipart");
const vendorController = require("../../controllers/adminControllers/vendorController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", vendorController.listVendors);
router.get("/:id", vendorController.getVendorById);
router.post("/", optionalVendorFiles, vendorController.createVendor);
router.patch("/:id", optionalVendorFiles, vendorController.updateVendor);
router.delete("/:id", vendorController.deleteVendor);

module.exports = router;
