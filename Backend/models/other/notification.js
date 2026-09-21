const mongoose = require("mongoose");

const STATUS = ["active", "inactive"];
const AUDIENCE_TYPES = ["users", "vendors", "deliveryPartners"];
const KINDS = ["notification", "announcement"];
const VENDOR_TARGET_TYPES = ["ecom", "venue"];

const notificationSchema = new mongoose.Schema(
  {
    audienceType: {
      type: String,
      required: true,
      enum: AUDIENCE_TYPES,
      trim: true,
      index: true,
    },
    kind: {
      type: String,
      enum: KINDS,
      default: "notification",
      trim: true,
      index: true,
    },
    vendorTargetTypes: {
      type: [{ type: String, enum: VENDOR_TARGET_TYPES }],
      default: [],
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: STATUS,
      default: "active",
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
