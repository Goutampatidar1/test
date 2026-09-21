const mongoose = require("mongoose");

const subDistrictSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

subDistrictSchema.index({ city: 1, name: 1 }, { unique: true });
subDistrictSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SubDistrict", subDistrictSchema);
