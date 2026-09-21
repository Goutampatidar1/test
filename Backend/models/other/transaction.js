const mongoose = require("mongoose");

const TRANSACTION_STATUSES = ["initiated", "pending", "success", "failed", "cancelled", "refunded"];
const TRANSACTION_TYPES = ["payment", "refund"];
const PAYMENT_METHODS = ["cod", "online", "wallet"];

const transactionSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    gatewayOrderId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    gatewayPaymentId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    gateway: {
      type: String,
      default: "",
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "online",
      index: true,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      default: "payment",
      index: true,
    },
    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
      default: "initiated",
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Transaction", transactionSchema);
