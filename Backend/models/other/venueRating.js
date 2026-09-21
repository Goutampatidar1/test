const mongoose = require("mongoose");

const venueRatingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    venue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      required: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VenueOrder",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

venueRatingSchema.index({ user: 1, booking: 1 }, { unique: true });
venueRatingSchema.index({ venue: 1, createdAt: -1 });

module.exports = mongoose.model("VenueRating", venueRatingSchema);
