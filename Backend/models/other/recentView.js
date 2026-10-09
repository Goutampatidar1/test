const mongoose = require("mongoose");

/** Products a user opened recently — feeds the "Suggested for you" home section. */
const recentViewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    viewedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

recentViewSchema.index({ user: 1, product: 1 }, { unique: true });
recentViewSchema.index({ user: 1, viewedAt: -1 });
// forget views after 60 days
recentViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

module.exports = mongoose.model("RecentView", recentViewSchema);
