const express = require("express");
const mobileAppSettingsController = require("../controllers/publicControllers/mobileAppSettingsController");

const router = express.Router();

router.get("/app-settings", mobileAppSettingsController.getAppSettings);

module.exports = router;
