const mongoose = require("mongoose");

const ALLOWED_STATUS = ["active", "inactive"];

const productVideoFeedSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    variantSku: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    video: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 32,
    },
    status: {
      type: String,
      enum: ALLOWED_STATUS,
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

productVideoFeedSchema.index({ vendor: 1, createdAt: -1 });
productVideoFeedSchema.index({ product: 1, variantSku: 1 });

module.exports = mongoose.model("ProductVideoFeed", productVideoFeedSchema);
