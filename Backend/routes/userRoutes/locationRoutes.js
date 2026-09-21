const express = require("express");
const locationController = require("../../controllers/vendorControllers/locationController");

const router = express.Router();

router.get("/cities", locationController.listUserCities);
router.get("/sub-districts", locationController.listSubDistricts);
router.get("/cities/:cityId/sub-districts", locationController.listSubDistricts);

module.exports = router;
