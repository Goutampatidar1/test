const mongoose = require("mongoose");

const childCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 3,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    mode: {
      type: String,
      enum: ["venue", "ecom"],
      default: "ecom",
    },
    role: {
      type: String,
      enum: ["Admin", "VenueVendor", "Vendor"],
      default: "Admin",
      trim: true,
    },
    addedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "role",
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive", "pending", "rejected"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

childCategorySchema.index({ subCategory: 1, name: 1 });

module.exports = mongoose.model("ChildCategory", childCategorySchema);
