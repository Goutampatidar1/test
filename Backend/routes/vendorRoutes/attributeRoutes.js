const express = require("express");
const attributeController = require("../../controllers/vendorControllers/attributeController");
const { protectVendor } = require("../../middleware/auth");

const router = express.Router();

router.use(protectVendor);

/** All variant options for sub-category (SIZE TYPE + COLOR) */
router.get("/attributes/catalog", attributeController.getAttributeCatalog);
router.get(
  "/sub-categories/:subCategoryId/attributes/catalog",
  attributeController.getAttributeCatalog
);

router.get("/attributes/titles", attributeController.listAttributeTitles);
router.get("/attributes/values", attributeController.listAttributeValues);

/** Create if not exists */
router.post("/attributes/titles/ensure", attributeController.ensureAttributeTitle);
router.post("/attributes/values/ensure", attributeController.ensureAttributeValue);
router.post("/attributes/ensure", attributeController.ensureAttribute);

module.exports = router;
