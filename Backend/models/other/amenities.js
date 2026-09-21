const mongoose = require("mongoose");

const STATUS = ["active", "inactive"];
const ROLES = ["Admin", "VenueVendor", "Vendor"];

const amenitiesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    icon: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    role: {
      type: String,
      enum: ROLES,
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
      enum: STATUS,
      default: "active",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Amenity", amenitiesSchema);
