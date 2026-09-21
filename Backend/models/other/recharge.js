const mongoose = require("mongoose");

const RECHARGE_TYPES = ["mobile", "gas", "fastag"];
const RECHARGE_STATUSES = ["pending", "success", "failed"];

const rechargeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: RECHARGE_TYPES,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    provider: {
      type: String,
      default: "",
      trim: true,
    },
    referenceId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: RECHARGE_STATUSES,
      default: "success",
      index: true,
    },
    detailModel: {
      type: String,
      enum: ["MobileRechargeDetail", "GasRechargeDetail", "FastagRechargeDetail"],
      default: null,
    },
    detailRef: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "detailModel",
      default: null,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Recharge", rechargeSchema);
