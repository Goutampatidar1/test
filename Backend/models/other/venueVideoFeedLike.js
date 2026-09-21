const mongoose = require("mongoose");

const venueVideoFeedLikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    videoFeed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VenueVideoFeed",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

venueVideoFeedLikeSchema.index({ user: 1, videoFeed: 1 }, { unique: true });
venueVideoFeedLikeSchema.index({ videoFeed: 1, createdAt: -1 });

module.exports = mongoose.model("VenueVideoFeedLike", venueVideoFeedLikeSchema);
