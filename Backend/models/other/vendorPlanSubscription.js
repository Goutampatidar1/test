const mongoose = require("mongoose");

const OWNER_TYPES = ["ecom", "venue"];
const PLAN_TYPES = ["banner", "get_verified", "product_presence_first"];
const STATUS = ["pending", "active", "expired", "cancelled"];
const PAID_VIA = ["razorpay", "free", "wallet", "manual"];
const PRESENCE_MODES = ["random"];

const vendorPlanSubscriptionSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      required: true,
      enum: OWNER_TYPES,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorPlan",
      required: true,
      index: true,
    },
    planType: {
      type: String,
      required: true,
      enum: PLAN_TYPES,
      index: true,
    },
    planName: {
      type: String,
      default: "",
      trim: true,
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
    status: {
      type: String,
      enum: STATUS,
      default: "pending",
      index: true,
    },
    /** Banner plan: exactly one image (replace allowed) */
    bannerImage: {
      type: String,
      default: null,
      trim: true,
    },
    bannerTitle: {
      type: String,
      default: "",
      trim: true,
    },
    /** Product Presence First snapshot from plan */
    presenceTopLimit: {
      type: Number,
      min: 1,
      default: 100,
    },
    presenceMode: {
      type: String,
      enum: PRESENCE_MODES,
      default: "random",
    },
    /** Product Presence First: exactly one product shown on public home */
    featuredProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    paidVia: {
      type: String,
      enum: PAID_VIA,
      default: "razorpay",
    },
    walletTransactionId: {
      type: String,
      default: null,
      trim: true,
    },
    gateway: {
      type: String,
      default: "razorpay",
      trim: true,
    },
    razorpayOrderId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      trim: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
      trim: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/** One active subscription per owner + planType */
vendorPlanSubscriptionSchema.index(
  { ownerType: 1, owner: 1, planType: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

module.exports = mongoose.model("VendorPlanSubscription", vendorPlanSubscriptionSchema);
module.exports.OWNER_TYPES = OWNER_TYPES;
module.exports.PLAN_TYPES = PLAN_TYPES;
module.exports.STATUS = STATUS;
module.exports.PAID_VIA = PAID_VIA;
module.exports.PRESENCE_MODES = PRESENCE_MODES;
