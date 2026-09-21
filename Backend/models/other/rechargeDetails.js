const mongoose = require("mongoose");

const mobileRechargeDetailSchema = new mongoose.Schema(
  {
    operator: { type: String, default: "", trim: true },
    plan: { type: String, default: "", trim: true },
  },
  { timestamps: false, versionKey: false }
);

const gasRechargeDetailSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, default: "", trim: true, index: true },
    consumerNo: { type: String, default: "", trim: true },
    bookedAt: { type: Date, default: null },
    eta: { type: Date, default: null },
    updateMessage: { type: String, default: "", trim: true },
  },
  { timestamps: false, versionKey: false }
);

const fastagRechargeDetailSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, default: "", trim: true, index: true },
    consumerNo: { type: String, default: "", trim: true },
    bookedAt: { type: Date, default: null },
    eta: { type: Date, default: null },
    updateMessage: { type: String, default: "", trim: true },
    vehicleNumber: { type: String, default: "", trim: true },
  },
  { timestamps: false, versionKey: false }
);

const MobileRechargeDetail = mongoose.model("MobileRechargeDetail", mobileRechargeDetailSchema);
const GasRechargeDetail = mongoose.model("GasRechargeDetail", gasRechargeDetailSchema);
const FastagRechargeDetail = mongoose.model("FastagRechargeDetail", fastagRechargeDetailSchema);

module.exports = {
  MobileRechargeDetail,
  GasRechargeDetail,
  FastagRechargeDetail,
};
