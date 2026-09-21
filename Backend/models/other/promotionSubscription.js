const mongoose = require("mongoose");

const PLAN_TYPES = ["banner", "get_verified", "product_presence_first"];
const DURATION_TYPES = ["daily", "weekly", "monthly"];
const APPROVAL_STATUS = ["pending", "approved", "rejected"];
const STATUS = [
  "pending_payment",
  "pending_review",
  "scheduled",
  "active",
  "expired",
  "rejected",
  "cancelled",
];
const PAYMENT_STATUS = ["pending", "paid", "failed", "free"];
const BANNER_TARGET_TYPES = ["product", "shop", "venue"];
const OWNER_TYPES = ["ecom", "venue"];

const promotionSubscriptionSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: OWNER_TYPES,
      default: "ecom",
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
      index: true,
    },
    venueVendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VenueVendor",
      default: null,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionPlan",
      required: true,
      index: true,
    },
    planName: { type: String, default: "", trim: true },
    planType: {
      type: String,
      required: true,
      enum: PLAN_TYPES,
      index: true,
    },
    presenceTopLimit: {
      type: Number,
      default: null,
    },
    durationType: {
      type: String,
      required: true,
      enum: DURATION_TYPES,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
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
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    purchaseDate: {
      type: Date,
      default: null,
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
      index: true,
    },
    subDistrictId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubDistrict",
      required: true,
      index: true,
    },
    cityName: { type: String, default: "", trim: true },
    subDistrictName: { type: String, default: "", trim: true },

    bannerImage: { type: String, default: null, trim: true },
    targetType: {
      type: String,
      enum: BANNER_TARGET_TYPES,
      default: null,
    },
    targetProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    targetVenueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      default: null,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },

    gateway: { type: String, default: "razorpay", trim: true },
    razorpayOrderId: { type: String, default: null, trim: true, index: true },
    razorpayPaymentId: { type: String, default: null, trim: true },
    razorpaySignature: { type: String, default: null, trim: true },
    paymentId: { type: String, default: null, trim: true },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS,
      default: "pending",
      index: true,
    },

    approvalStatus: {
      type: String,
      enum: APPROVAL_STATUS,
      default: "pending",
      index: true,
    },
    status: {
      type: String,
      enum: STATUS,
      default: "pending_payment",
      index: true,
    },
    rejectionReason: { type: String, default: null, trim: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

promotionSubscriptionSchema.index({ planType: 1, status: 1, approvalStatus: 1 });
promotionSubscriptionSchema.index({ cityId: 1, subDistrictId: 1, planType: 1, status: 1 });
promotionSubscriptionSchema.index({ vendor: 1, createdAt: -1 });

module.exports = mongoose.model("PromotionSubscription", promotionSubscriptionSchema);
module.exports.PLAN_TYPES = PLAN_TYPES;
module.exports.DURATION_TYPES = DURATION_TYPES;
module.exports.APPROVAL_STATUS = APPROVAL_STATUS;
module.exports.STATUS = STATUS;
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
module.exports.BANNER_TARGET_TYPES = BANNER_TARGET_TYPES;
module.exports.OWNER_TYPES = OWNER_TYPES;
