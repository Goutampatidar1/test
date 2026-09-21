const mongoose = require("mongoose");

const STATUSES = ["pending", "approved", "rejected", "cancelled"];

const vendorWithdrawalRequestSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
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
    accountType: { type: String, default: "", trim: true },
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
      ref: "VendorWalletTransaction",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("VendorWithdrawalRequest", vendorWithdrawalRequestSchema);
