const mongoose = require("mongoose");

const PLAN_TYPES = ["banner", "get_verified", "product_presence_first", "show_phone"];
const VENDOR_TYPES = ["ecom", "venue", "both"];
const STATUS = ["active", "inactive"];
const PRESENCE_MODES = ["random"];

const vendorPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    planType: {
      type: String,
      required: true,
      enum: PLAN_TYPES,
      index: true,
    },
    /** Who can buy this plan: ecom vendor, venue vendor, or both */
    vendorType: {
      type: String,
      required: true,
      enum: VENDOR_TYPES,
      default: "both",
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    /** Product Presence First: keep vendor in top N listings */
    presenceTopLimit: {
      type: Number,
      min: 1,
      default: 100,
    },
    /** Product Presence First: how featured items are shown */
    presenceMode: {
      type: String,
      enum: PRESENCE_MODES,
      default: "random",
    },
    status: {
      type: String,
      enum: STATUS,
      default: "active",
      index: true,
    },
    /**
     * Duration plans (e.g. Show Number tiers): when > 0 the subscription runs for this many days
     * from activation instead of using the plan's start/end dates (those become the sale window).
     */
    durationDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    /** Shown on plan cards in the vendor app / panel. */
    description: { type: String, default: "", trim: true, maxlength: 500 },
    benefits: { type: [String], default: [] },
    badge: { type: String, default: "", trim: true, maxlength: 40 },
    isRecommended: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

vendorPlanSchema.index({ planType: 1, vendorType: 1, status: 1 });

module.exports = mongoose.model("VendorPlan", vendorPlanSchema);
module.exports.PLAN_TYPES = PLAN_TYPES;
module.exports.VENDOR_TYPES = VENDOR_TYPES;
module.exports.STATUS = STATUS;
module.exports.PRESENCE_MODES = PRESENCE_MODES;
