const mongoose = require("mongoose");

const ALLOWED_STATUS = ["active", "inactive"];

const venueVideoFeedSchema = new mongoose.Schema(
  {
    venueVendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VenueVendor",
      required: true,
      index: true,
    },
    venue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      default: null,
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

venueVideoFeedSchema.index({ venueVendor: 1, createdAt: -1 });
venueVideoFeedSchema.index({ venue: 1, createdAt: -1 });

module.exports = mongoose.model("VenueVideoFeed", venueVideoFeedSchema);