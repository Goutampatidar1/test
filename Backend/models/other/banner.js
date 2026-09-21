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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Banner", bannerSchema);
module.exports.RELATED_TYPES = RELATED_TYPES;
module.exports.TARGET_TYPES = TARGET_TYPES;
