const mongoose = require("mongoose");

const STATIC_PAGE_APPS = ["user", "vendor", "venue_vendor", "delivery"];

const staticPageLayoutSchema = new mongoose.Schema(
  {
    app: {
      type: String,
      enum: STATIC_PAGE_APPS,
      required: true,
      unique: true,
      index: true,
    },
    headerContent: {
      type: String,
      default: "",
    },
    footerContent: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StaticPageLayout", staticPageLayoutSchema);
