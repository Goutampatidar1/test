const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const stateController = require("../../controllers/adminControllers/stateController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", stateController.listStates);
router.get("/:id", stateController.getStateById);
router.post("/", stateController.createState);
router.patch("/:id", stateController.updateState);
router.delete("/:id", stateController.deleteState);

module.exports = router;
