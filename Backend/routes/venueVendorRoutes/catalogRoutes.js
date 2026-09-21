const express = require("express");
const { protectVenueVendor } = require("../../middleware/auth");
const publicCatalogController = require("../../controllers/publicControllers/publicCatalogController");

const router = express.Router();

router.use(protectVenueVendor);

function withVenueMode(req, _res, next) {
  if (!req.query.mode) req.query.mode = "venue";
  next();
}

router.get("/categories", publicCatalogController.listVenueCatalogCategories);
router.get("/sub-categories", withVenueMode, publicCatalogController.listSubCategories);
router.get("/amenities", publicCatalogController.listAmenities);

module.exports = router;
