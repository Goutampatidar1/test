const mongoose = require("mongoose");

const DIRECTIONS = ["credit", "debit"];
const CATEGORIES = ["order_earning", "withdrawal", "withdrawal_refund", "adjustment", "plan_purchase"];
const STATUSES = ["pending", "success", "failed", "cancelled"];

const vendorWalletTransactionSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
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
      ref: "VendorWithdrawalRequest",
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

vendorWalletTransactionSchema.index({ vendor: 1, order: 1, category: 1 });

module.exports = mongoose.model("VendorWalletTransaction", vendorWalletTransactionSchema);
