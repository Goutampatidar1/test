const express = require("express");
const documentsController = require("../../controllers/deliveryBoyControllers/deliveryDocumentsController");
const { protectDeliveryBoy } = require("../../middleware/auth");
const { optionalDeliveryBoyDocumentFiles } = require("../../middleware/authMultipart");

const router = express.Router();

router.get("/", protectDeliveryBoy, documentsController.getDocuments);
router.patch(
  "/",
  protectDeliveryBoy,
  optionalDeliveryBoyDocumentFiles,
  documentsController.updateDocuments
);

module.exports = router;
