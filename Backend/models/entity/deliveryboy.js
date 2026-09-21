const mongoose = require("mongoose");

const STATUS = ["active", "inactive", "blocked"];
const APPROVAL_STATUS = ["pending", "approved", "rejected", "suspended"];
const GENDER = ["male", "female", "other"];

const deliveryBoySchema = new mongoose.Schema(
  {
    // Personal details
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, default: null }, // optional password support
    phone: { type: String, required: true, trim: true },
    city: { type: String, default: null, trim: true },
    subDistrict: { type: String, default: null, trim: true },
    subDistrictId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubDistrict",
      default: null,
      index: true,
    },
    address: { type: String, default: null, trim: true },
    dob: { type: Date, default: null },
    gender: {
      type: String,
      enum: GENDER,
      default: "male",
    },
    profileImage: { type: String, default: null, trim: true },
    fcm_id: { type: String, default: null, trim: true },

    // Vehicle details
    vehicleRegistrationNumber: { type: String, default: null, trim: true },
    licenseNumber: { type: String, default: null, trim: true },
    vehicleType: { type: String, default: null, trim: true },
    drivingLicenseFront: { type: String, default: null, trim: true },
    drivingLicenseBack: { type: String, default: null, trim: true },
    aadhaarCardFront: { type: String, default: null, trim: true },
    aadhaarCardBack: { type: String, default: null, trim: true },
    aadhaarCard: { type: String, default: null, trim: true },

    // Bank details
    bankAccountName: { type: String, default: null, trim: true },
    accountNumber: { type: String, default: null, trim: true },
    bankName: { type: String, default: null, trim: true },
    branchName: { type: String, default: null, trim: true },
    ifscCode: { type: String, default: null, trim: true },

    // Auth lifecycle
    otp: { type: String, default: null },
    otpExpire: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpire: { type: Date, default: null },
    status: {
      type: String,
      enum: STATUS,
      default: "active",
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: APPROVAL_STATUS,
      default: "pending",
      index: true,
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    codPendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("DeliveryBoy", deliveryBoySchema);
