const mongoose = require("mongoose");

const DELIVERY_TYPES = ["home", "office", "other"];

const shippingAddressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: {
      type: String,
      enum: DELIVERY_TYPES,
      default: "home",
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    countryCode: {
      type: String,
      default: "+91",
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    houseNo: {
      type: String,
      default: "",
      trim: true,
    },
    buildingName: {
      type: String,
      default: "",
      trim: true,
    },
    roadName: {
      type: String,
      default: "",
      trim: true,
    },
    areaColony: {
      type: String,
      default: "",
      trim: true,
    },
    landmark: {
      type: String,
      default: "",
      trim: true,
    },
    country: {
      type: String,
      default: "",
      trim: true,
    },
    state: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      default: "",
      trim: true,
    },
    subDistrict: {
      type: String,
      default: "",
      trim: true,
    },
    subDistrictId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubDistrict",
      default: null,
      index: true,
    },
    pincode: {
      type: String,
      default: "",
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

shippingAddressSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("ShippingAddress", shippingAddressSchema);
