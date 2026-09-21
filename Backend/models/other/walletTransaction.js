const mongoose = require("mongoose");

const TRANSACTION_STATUSES = ["initiated", "pending", "success", "failed", "cancelled"];
const TRANSACTION_TYPES = ["topup", "payment"];

const walletTransactionSchema = new mongoose.Schema(
  {
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
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    gateway: {
      type: String,
      default: "",
      trim: true,
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
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      default: "topup",
      index: true,
    },
    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
      default: "success",
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
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

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
