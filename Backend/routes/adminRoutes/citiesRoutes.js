const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const cityController = require("../../controllers/adminControllers/cityController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", cityController.listCities);
router.get("/:id", cityController.getCityById);
router.post("/", cityController.createCity);
router.patch("/:id", cityController.updateCity);
router.delete("/:id", cityController.deleteCity);

module.exports = router;
