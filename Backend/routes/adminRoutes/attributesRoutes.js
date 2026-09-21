const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const attributeController = require("../../controllers/adminControllers/attributeController");

const router = express.Router();

router.use(protectAdmin);

router.get("/titles", attributeController.listAttributeTitles);
router.get("/titles/:id", attributeController.getAttributeTitleById);
router.post("/titles", attributeController.createAttributeTitle);
router.patch("/titles/:id", attributeController.updateAttributeTitle);
router.delete("/titles/:id", attributeController.deleteAttributeTitle);

router.get("/values", attributeController.listAttributeValues);
router.get("/values/:id", attributeController.getAttributeValueById);
router.post("/values", attributeController.createAttributeValue);
router.patch("/values/:id", attributeController.updateAttributeValue);
router.delete("/values/:id", attributeController.deleteAttributeValue);

module.exports = router;
