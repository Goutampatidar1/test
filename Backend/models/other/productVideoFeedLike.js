const mongoose = require("mongoose");

const productVideoFeedLikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    videoFeed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVideoFeed",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

productVideoFeedLikeSchema.index({ user: 1, videoFeed: 1 }, { unique: true });
productVideoFeedLikeSchema.index({ videoFeed: 1, createdAt: -1 });

module.exports = mongoose.model("ProductVideoFeedLike", productVideoFeedLikeSchema);
