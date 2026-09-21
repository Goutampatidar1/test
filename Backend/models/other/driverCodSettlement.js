const mongoose = require("mongoose");

const driverCodSettlementSchema = new mongoose.Schema(
  {
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true,
      index: true,
    },
    settlementNumber: {
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
    previousBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    adminNote: {
      type: String,
      default: "",
      trim: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
      index: true,
    },
    ledgerTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryWalletTransaction",
      default: null,
    },
    orderAllocations: {
      type: [
        new mongoose.Schema(
          {
            order: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Order",
              required: true,
            },
            orderNumber: { type: String, default: "", trim: true },
            amount: { type: Number, required: true, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("DriverCodSettlement", driverCodSettlementSchema);
