const mongoose = require("mongoose");

const stateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: null, trim: true, uppercase: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

stateSchema.index({ name: 1 }, { unique: true });
stateSchema.index({ createdAt: -1 });

module.exports = mongoose.model("State", stateSchema);
