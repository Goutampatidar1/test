const mongoose = require("mongoose");

const paymentGatewaySchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["razorpay", "stripe", "paypal", "paytm"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    credentials: {
      key_id: { type: String, default: "" },
      key_secret: { type: String, default: "" },
      webhook_secret: { type: String, default: "" },
      merchant_id: { type: String, default: "" },
    },
  },
  { _id: false }
);

const paymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["cod", "online", "wallet"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const DocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Aadhar Card", "Pan Card", "Bank Details"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);
const commissionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Vendor", "VenueVendor"],
      required: true,
    },
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const ecomFlowSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },
    scope: {
      type: String,
      enum: ["all", "city", "pincode", "sub_district"],
      default: "all",
    },
    rule: {
      type: String,
      enum: ["allow", "block"],
      default: "block",
    },
    cities: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "City" }],
      default: [],
    },
    pincodes: {
      type: [String],
      default: [],
    },
    subDistricts: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "SubDistrict" }],
      default: [],
    },
  },
  { _id: false }
);


const appConfigSchema = new mongoose.Schema(
  {
    app_name: {
      type: String,
      required: true,
      trim: true,
    },
    app_email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    app_mobile: {
      type: String,
      required: true,
    },
    app_detail: {
      type: String,
      default: "",
    },

    admin_logo: {
      type: String,
      default: "",
    },
    user_logo: {
      type: String,
      default: "",
    },
    favicon: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },
    latitude: {
      type: String,
      default: "",
    },
    longitude: {
      type: String,
      default: "",
    },
    facebook: {
      type: String,
      default: "",
    },
    twitter: {
      type: String,
      default: "",
    },
    instagram: {
      type: String,
      default: "",
    },
    linkedin: {
      type: String,
      default: "",
    },

    app_details: {
      type: String,
      default: "",
    },
    app_footer_text: {
      type: String,
      default: "",
    },

    payment_methods: {
      type: [paymentMethodSchema],
      default: () => [
        { type: "cod", isActive: true },
        { type: "online", isActive: true },
        { type: "wallet", isActive: true },
      ],
    },
    documents: {
      type: [DocumentSchema],
      default: () => [
        { type: "Aadhar Card", isActive: true },
        { type: "Pan Card", isActive: true },
        { type: "Bank Details", isActive: true },
      ],

    },

    payment_gateways: {
      type: [paymentGatewaySchema],
      default: () => [],
    },
    commissions: {
      type: [commissionSchema],
      default: () => [
        { type: "Vendor", percentage: 0 },
        { type: "VenueVendor", percentage: 0 },
      ],
    },
    shipping_charge: {
      type: Number,
      default: 40,
      min: 0,
    },
    ecom_flow: {
      type: ecomFlowSchema,
      default: () => ({
        enabled: true,
        scope: "all",
        rule: "block",
        cities: [],
        pincodes: [],
        subDistricts: [],
      }),
    },
    /** When true, vendor registration, products, venues, and catalog items need admin approval. */
    vendor_approval_required: {
      type: Boolean,
      default: true,
    },
    /** @deprecated use vendor_approval_required — kept for backward compatibility */
    vendor_product_approval_required: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppConfig", appConfigSchema);
