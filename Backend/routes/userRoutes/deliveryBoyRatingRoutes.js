const express = require("express");
const deliveryBoyRatingController = require("../../controllers/userControllers/deliveryBoyRatingController");
const { protectUser } = require("../../middleware/auth");

const router = express.Router();

router.use(protectUser);

router.get("/driver-review/:orderId", deliveryBoyRatingController.getMyDriverReview);
router.post("/driver-review/:orderId", deliveryBoyRatingController.createDriverReview);
router.put("/driver-review/:orderId", deliveryBoyRatingController.updateDriverReview);
router.patch("/driver-review/:orderId", deliveryBoyRatingController.updateDriverReview);
router.delete("/driver-review/:orderId", deliveryBoyRatingController.deleteMyDriverReview);

router.get("/driver-rating/:orderId", deliveryBoyRatingController.getMyDriverRating);
router.post("/driver-rating/:orderId", deliveryBoyRatingController.submitDriverRating);
router.delete("/driver-rating/:orderId", deliveryBoyRatingController.deleteMyDriverRating);

module.exports = router;
