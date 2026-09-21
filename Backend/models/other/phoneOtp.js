const mongoose = require("mongoose");

const phoneOtpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpire: {
      type: Date,
      required: true,
    },
    purpose: {
      type: String,
      enum: [
        "login",
        "register",
        "venue_vendor_login",
        "vendor_register",
        "vendor_login",
        "delivery_forgot_password",
      ],
      required: true,
    },
    /** Register flow: true after OTP verify, until sign-up form is submitted */
    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Expiry is enforced in API code on verify; records are removed after successful verify.

module.exports = mongoose.model("PhoneOtp", phoneOtpSchema);
