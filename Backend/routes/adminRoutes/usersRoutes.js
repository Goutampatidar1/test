const express = require("express");
const { protectAdmin } = require("../../middleware/auth");
const { optionalUserFile } = require("../../middleware/authMultipart");
const userController = require("../../controllers/adminControllers/userController");

const router = express.Router();

router.use(protectAdmin);

router.get("/", userController.listUsers);
router.get("/:id", userController.getUserById);
router.post("/", optionalUserFile, userController.createUser);
router.patch("/:id", optionalUserFile, userController.updateUser);
router.delete("/:id", userController.deleteUser);

module.exports = router;
