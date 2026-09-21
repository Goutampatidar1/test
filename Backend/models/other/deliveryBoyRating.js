const mongoose = require("mongoose");

const deliveryBoyRatingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

deliveryBoyRatingSchema.index({ user: 1, order: 1 }, { unique: true });
deliveryBoyRatingSchema.index({ deliveryBoy: 1, createdAt: -1 });

module.exports = mongoose.model("DeliveryBoyRating", deliveryBoyRatingSchema);
