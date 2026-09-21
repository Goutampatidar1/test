const mongoose = require("mongoose");

const PLAN_TYPES = ["banner", "get_verified", "product_presence_first"];
const VENDOR_TYPES = ["ecom", "venue"];
const DURATION_TYPES = ["daily", "weekly", "monthly"];
const STATUS = ["active", "inactive"];
const PRESENCE_TOP_LIMITS = [50, 100];

const durationOptionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: DURATION_TYPES,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const promotionPlanSchema = new mongoose.Schema(
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
    vendorType: {
      type: String,
      enum: VENDOR_TYPES,
      default: "ecom",
      index: true,
    },
    durationOptions: {
      type: [durationOptionSchema],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one duration option is required",
      },
    },
    /** Product Presence First only */
    presenceTopLimit: {
      type: Number,
      enum: PRESENCE_TOP_LIMITS,
      default: null,
    },
    status: {
      type: String,
      enum: STATUS,
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

promotionPlanSchema.index({ planType: 1, status: 1 });

module.exports = mongoose.model("PromotionPlan", promotionPlanSchema);
module.exports.PLAN_TYPES = PLAN_TYPES;
module.exports.VENDOR_TYPES = VENDOR_TYPES;
module.exports.DURATION_TYPES = DURATION_TYPES;
module.exports.STATUS = STATUS;
module.exports.PRESENCE_TOP_LIMITS = PRESENCE_TOP_LIMITS;
