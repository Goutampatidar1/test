const mongoose = require("mongoose");


const attributeTitleSchema = new mongoose.Schema(
  {
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
    childCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChildCategory",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

attributeTitleSchema.index({ subCategory: 1, childCategory: 1, title: 1 });

module.exports = mongoose.model("AttributeTitle", attributeTitleSchema);
