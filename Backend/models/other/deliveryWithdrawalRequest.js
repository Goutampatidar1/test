const mongoose = require("mongoose");

const STATUSES = ["pending", "approved", "rejected", "cancelled"];

const deliveryWithdrawalRequestSchema = new mongoose.Schema(
  {
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true,
      index: true,
    },
    requestNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
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
      default: "pending",
      index: true,
    },
    bankAccountName: { type: String, default: "", trim: true },
    accountNumber: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },
    branchName: { type: String, default: "", trim: true },
    ifscCode: { type: String, default: "", trim: true },
    adminNote: { type: String, default: "", trim: true },
    rejectionReason: { type: String, default: "", trim: true },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    walletTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryWalletTransaction",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("DeliveryWithdrawalRequest", deliveryWithdrawalRequestSchema);
