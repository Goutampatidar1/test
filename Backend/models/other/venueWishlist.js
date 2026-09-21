const mongoose = require("mongoose");

const venueWishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    venues: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Venue",
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("VenueWishlist", venueWishlistSchema);
