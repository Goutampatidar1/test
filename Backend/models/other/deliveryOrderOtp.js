const mongoose = require("mongoose");

const STATUSES = ["active", "verified", "cancelled"];

const deliveryOrderOtpSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
      trim: true,
    },
    otpExpire: {
      type: Date,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "active",
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("DeliveryOrderOtp", deliveryOrderOtpSchema);
