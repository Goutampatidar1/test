const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const faqController = require("../../controllers/adminControllers/faqController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", faqController.listFaqs);
router.get("/:id", faqController.getFaqById);
router.post("/", faqController.createFaq);
router.patch("/:id", faqController.updateFaq);
router.delete("/:id", faqController.deleteFaq);

module.exports = router;
