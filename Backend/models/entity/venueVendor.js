const mongoose = require("mongoose");
const { normalizePhone } = require("../../utils/phone");

const STATUS = ["active", "inactive", "blocked"];
const APPROVAL_STATUS = ["pending", "approved", "rejected", "suspended"];
const ACCOUNT_TYPE = ["Current", "Savings"];
const GENDER = ["male", "female", "other"];
const VENDOR_PANEL_TYPES = ["ecom", "service", "both"];

const venueVendorSchema = new mongoose.Schema(
  {
    // Personal details
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, trim: true },
    // Kept separately so a unique index can protect new records while legacy
    // duplicate records are reviewed and cleaned up.
    phoneCanonical: {
      type: String,
      select: false,
      unique: true,
      sparse: true,
    },
    gender: { type: String, enum: GENDER, default: "male" },
    profileImage: { type: String, default: null, trim: true },

    // Auth / notifications
    passwordHash: { type: String, default: null, select: false },
    fcm_id: { type: String, default: null, trim: true },

    // Business details
    businessName: { type: String, default: null, trim: true },
    businessPhone: { type: String, default: null, trim: true },
    businessEmail: { type: String, default: null, trim: true, lowercase: true },
    businessAddress: { type: String, default: null, trim: true },
    businessDescription: { type: String, default: null, trim: true },
    panNumber: { type: String, default: null, trim: true },
    gstNumber: { type: String, default: null, trim: true },

    // Bank details
    bankName: { type: String, default: null, trim: true },
    branchName: { type: String, default: null, trim: true },
    accountType: { type: String, enum: ACCOUNT_TYPE, default: null },
    accountNumber: { type: String, default: null, trim: true },
    ifscCode: { type: String, default: null, trim: true },

    // Documents upload
    aadhaarCardFront: { type: String, default: null, trim: true },
    aadhaarCardBack: { type: String, default: null, trim: true },
    aadhaarCard: { type: String, default: null, trim: true },
    panCard: { type: String, default: null, trim: true },

    // Account lifecycle
    otp: { type: String, default: null, select: false },
    otpExpire: { type: Date, default: null, select: false },
    resetPasswordToken: { type: String, default: null, select: false },
    resetPasswordExpire: { type: Date, default: null, select: false },
    status: { type: String, enum: STATUS, default: "active", index: true },
    approvalStatus: { type: String, enum: APPROVAL_STATUS, default: "pending", index: true },
    /** When false, storefront hides this vendor's venues. */
    isOpen: { type: Boolean, default: true, index: true },
    /** When false, user apps hide this vendor's contact number. */
    showPhoneOnApp: { type: Boolean, default: true },
    rejectionReason: { type: String, default: null, trim: true },
    /** Vendor panel registration type — ecom shop, service provider, or both. */
    vendorPanelType: {
      type: String,
      enum: VENDOR_PANEL_TYPES,
      default: "service",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

venueVendorSchema.pre("save", function stripEmptyEmail(next) {
  if (this.email == null || String(this.email).trim() === "") {
    this.email = undefined;
    if (this._doc) delete this._doc.email;
  }
  next();
});

venueVendorSchema.pre("validate", function setCanonicalPhone(next) {
  if (!this.isNew && !this.isModified("phone")) {
    return next();
  }
  try {
    this.phone = normalizePhone(this.phone);
    this.phoneCanonical = this.phone;
    next();
  } catch (err) {
    next(err);
  }
});

venueVendorSchema.index(
  { email: 1 },
  {
    unique: true,
    name: "email_1",
    partialFilterExpression: { email: { $type: "string", $gt: "" } },
  }
);
venueVendorSchema.index({ createdAt: -1 });
venueVendorSchema.index({ businessName: 1 });

module.exports = mongoose.model("VenueVendor", venueVendorSchema);
