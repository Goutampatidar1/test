const mongoose = require("mongoose");

const STATUS = ["active", "inactive"];
const TARGET_TYPES = ["ecom", "venue", "user"];
const RELATED_TYPES = ["none", "category", "product", "vendor"];

const bannerSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      required: true,
      enum: TARGET_TYPES,
      default: "ecom",
      index: true,
    },
    mode: {
      type: String,
      required: true,
      enum: ["global", "city"],
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    /** Only used when targetType is "user" — what the banner taps through to */
    related: {
      type: String,
      enum: RELATED_TYPES,
      default: "none",
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    /** Product or vendor id when related is product / vendor */
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      set: (value) => (value === "" || value === undefined ? null : value),
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    cities: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: STATUS,
      default: "active",
      index: true,
    },
    /** Rich banner content (shown over / beside the image in the apps) */
    subtitle: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    ctaText: { type: String, trim: true, default: "" },
    badge: { type: String, trim: true, default: "" },
    bgColor: { type: String, trim: true, default: "" },
    textColor: { type: String, trim: true, default: "" },
    /** Lower shows first */
    displayOrder: { type: Number, default: 0, index: true },
    /** Countdown timer shown on the banner */
    showTimer: { type: Boolean, default: false },
    timerLabel: { type: String, trim: true, default: "" },
    /** Exact moment the timer ends and the banner stops being served; falls back to end of endDate */
    timerEndsAt: { type: Date, default: null, index: true },
    /** Stored image dimensions so apps can size the banner without a layout jump */
    imageWidth: { type: Number, default: null },
    imageHeight: { type: Number, default: null },
    /** Set by the scheduler when a banner is switched off because its end time passed */
    autoExpired: { type: Boolean, default: false },
    expiredAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Banner", bannerSchema);
module.exports.RELATED_TYPES = RELATED_TYPES;
module.exports.TARGET_TYPES = TARGET_TYPES;
