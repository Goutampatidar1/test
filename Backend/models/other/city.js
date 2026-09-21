const mongoose = require("mongoose");

const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    state: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "State",
      required: true,
      index: true,
    },
    pincode: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

citySchema.index({ state: 1, name: 1 }, { unique: true });
citySchema.index({ createdAt: -1 });

module.exports = mongoose.model("City", citySchema);
