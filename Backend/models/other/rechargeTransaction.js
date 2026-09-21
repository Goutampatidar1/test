const mongoose = require("mongoose");

const RECHARGE_TYPES = ["mobile", "gas", "fastag"];
const TRANSACTION_TYPES = ["payment", "refund"];
const TRANSACTION_STATUSES = ["initiated", "pending", "success", "failed", "cancelled", "refunded"];
const PAYMENT_METHODS = ["upi", "card", "netbanking", "wallet", "cod"];

const rechargeTransactionSchema = new mongoose.Schema(
  {
    recharge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recharge",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rechargeType: {
      type: String,
      enum: RECHARGE_TYPES,
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
    referenceId: {
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
      default: "payment",
      index: true,
    },
    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
      default: "initiated",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "upi",
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

module.exports = mongoose.model("RechargeTransaction", rechargeTransactionSchema);
