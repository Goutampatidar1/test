const mongoose = require("mongoose");

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded", "partially_paid"];
const PAYMENT_METHODS = ["cod", "online", "wallet"];

const venueOrderItemSchema = new mongoose.Schema(
  {
    venue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    bookingDate: {
      type: Date,
      default: null,
    },
    bookingSlot: {
      type: String,
      default: "",
      trim: true,
    },
    bookingType: {
      type: String,
      enum: ["hourly", "full_day"],
      default: "full_day",
      trim: true,
    },
    startTime: {
      type: String,
      default: "",
      trim: true,
    },
    endTime: {
      type: String,
      default: "",
      trim: true,
    },
    durationHours: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const venueOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [venueOrderItemSchema],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "Venue order must include at least one item",
      },
    },
    subTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    tokenAmountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    tokenAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "online",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
      index: true,
    },
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    addressSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    placedAt: {
      type: Date,
      default: Date.now,
    },
    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    invoicePdf: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("VenueOrder", venueOrderSchema);
