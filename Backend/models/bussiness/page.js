const mongoose = require("mongoose");

const STATIC_PAGE_APPS = ["user", "vendor", "venue_vendor", "delivery"];

const pageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      minlength: 3,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    app: {
      type: String,
      enum: STATIC_PAGE_APPS,
      default: "user",
      required: true,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive"],
    },
  },
  { timestamps: true }
);

pageSchema.index({ app: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model("Page", pageSchema);
