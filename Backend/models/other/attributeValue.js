const mongoose = require("mongoose");


const attributeValueSchema = new mongoose.Schema(
  {
    attributeTitle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AttributeTitle",
        required: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
    colorCode: {
      type: String,
      trim: true,
      default: "",
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

module.exports = mongoose.model("AttributeValue", attributeValueSchema);
