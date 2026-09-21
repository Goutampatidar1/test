const mongoose = require("mongoose");

const DIRECTIONS = ["credit", "debit"];
const CATEGORIES = ["delivery_earning", "withdrawal", "withdrawal_refund", "adjustment", "cod_collection", "cod_settlement"];
const STATUSES = ["pending", "success", "failed", "cancelled"];

const deliveryWalletTransactionSchema = new mongoose.Schema(
  {
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
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
    direction: {
      type: String,
      enum: DIRECTIONS,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: CATEGORIES,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "success",
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    withdrawalRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryWithdrawalRequest",
      default: null,
      index: true,
    },
    codSettlement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriverCodSettlement",
      default: null,
      index: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
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

module.exports = mongoose.model("DeliveryWalletTransaction", deliveryWalletTransactionSchema);
