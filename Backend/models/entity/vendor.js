const mongoose = require("mongoose");

const STATUS = ["active", "inactive", "blocked"];
const APPROVAL_STATUS = ["pending", "approved", "rejected", "suspended"];
const GENDER = ["male", "female", "other"];
const ACCOUNT_TYPE = ["Current", "Savings"];
const VENDOR_PANEL_TYPES = ["ecom", "service", "both"];

const vendorSchema = new mongoose.Schema(
  {
    // Identity
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, default: null, select: false },
    phone: { type: String, required: true, trim: true, unique: true, index: true },
    dob: { type: Date, default: null },
    gender: { type: String, enum: GENDER, default: null },
    profileImage: { type: String, default: null, trim: true },
    fcm_id: { type: String, default: null, trim: true },

    // Business
    businessName: { type: String, default: null, trim: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    businessPhone: { type: String, default: null, trim: true },
    gstin: { type: String, default: null, trim: true },
    panCardNumber: { type: String, default: null, trim: true },
    businessAddress: { type: String, default: null, trim: true },
    shopDescription: { type: String, default: null, trim: true, maxlength: 100 },
    country: { type: String, default: null, trim: true },
    state: { type: String, default: null, trim: true },
    city: { type: String, default: null, trim: true },
    subDistrict: { type: String, default: null, trim: true },
    pincode: { type: String, default: null, trim: true },

    // Documents / media
    aadhaarCardFront: { type: String, default: null, trim: true },
    aadhaarCardBack: { type: String, default: null, trim: true },
    panCardFront: { type: String, default: null, trim: true },
    shopLogo: { type: String, default: null, trim: true },
    shopImages: { type: [String], default: [] },
    shopVideos: { type: [String], default: [] },
    shopBanner: { type: String, default: null, trim: true },

    // Banking
    bankName: { type: String, default: null, trim: true },
    branchName: { type: String, default: null, trim: true },
    accountHolderName: { type: String, default: null, trim: true },
    accountNo: { type: String, default: null, trim: true },
    ifsc: { type: String, default: null, trim: true },
    accountType: { type: String, enum: ACCOUNT_TYPE, default: "Current" },

    // Auth / account lifecycle
    otp: { type: String, default: null, select: false },
    otpExpire: { type: Date, default: null, select: false },
    resetPasswordToken: { type: String, default: null, select: false },
    resetPasswordExpire: { type: Date, default: null, select: false },
    status: { type: String, enum: STATUS, default: "active", index: true },
    approvalStatus: {
      type: String,
      enum: APPROVAL_STATUS,
      default: "pending",
      index: true,
    },
    /** When false, storefront hides this vendor's products / profile. */
    isOpen: { type: Boolean, default: true, index: true },
    /** When false, user apps hide this vendor's contact number. */
    showPhoneOnApp: { type: Boolean, default: true },
    rejectionReason: { type: String, default: null, trim: true },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Vendor panel registration type — ecom shop, service provider, or both. */
    vendorPanelType: {
      type: String,
      enum: VENDOR_PANEL_TYPES,
      default: "ecom",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

vendorSchema.index({ email: 1 }, { unique: true, sparse: true });
vendorSchema.index({ createdAt: -1 });
vendorSchema.index({ businessName: 1 });

vendorSchema.pre("save", function stripEmptyEmail(next) {
  if (this.email == null || this.email === "") {
    this.set("email", undefined);
  }
  next();
});

module.exports = mongoose.model("Vendor", vendorSchema);
