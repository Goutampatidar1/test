const mongoose = require("mongoose");

const RECIPIENT_TYPES = ["user", "vendor", "admin", "venueVendor", "deliveryBoy"];
const NOTIFICATION_TYPES = [
  "ecom_order_placed",
  "ecom_order_status_updated",
  "venue_booking_placed",
  "vendor_registered",
  "venue_vendor_registered",
  "product_pending_approval",
  "admin_broadcast",
  "delivery_order_assigned",
  "delivery_order_status_updated",
];

const appNotificationSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: RECIPIENT_TYPES,
      required: true,
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    orderNumber: {
      type: String,
      default: "",
      trim: true,
    },
    orderStatus: {
      type: String,
      default: "",
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

appNotificationSchema.index({ recipientType: 1, recipient: 1, createdAt: -1 });

module.exports = mongoose.model("AppNotification", appNotificationSchema);
