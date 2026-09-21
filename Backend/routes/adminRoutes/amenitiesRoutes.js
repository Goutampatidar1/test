const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalAmenitiesFile } = require("../../middleware/authMultipart");
const amenitiesController = require("../../controllers/adminControllers/amenitiesController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", amenitiesController.listAmenities);
router.get("/:id", amenitiesController.getAmenityById);
router.post("/", optionalAmenitiesFile, amenitiesController.createAmenity);
router.patch("/:id", optionalAmenitiesFile, amenitiesController.updateAmenity);
router.delete("/:id", amenitiesController.deleteAmenity);

module.exports = router;
