const mongoose = require("mongoose");

const ALLOWED_STATUS = ["active", "inactive"];
const ALLOWED_ROLES = ["Admin", "VenueVendor", "Vendor"];
const ALLOWED_DISCOUNT_TYPES = ["percentage", "flat"];
const ALLOWED_TAX_TYPES = ["inclusive", "exclusive"];
const ALLOWED_VARIANT_TYPES = ["single", "multi"];


const variantAttributeSchema = new mongoose.Schema(
  {
    attributeTitle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttributeTitle",
      required: true,
    },
    attributeValue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttributeValue",
      required: true,
    },
  },
  { _id: false }
);

const VariantCombinationSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true },
    attributes: { type: [variantAttributeSchema], default: [] },
    price: { type: Number, required: true, min: 1, default: 1 },
    discountValue: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    images: { type: [String], default: [] },
    status: { type: String, enum: ALLOWED_STATUS, default: "active" },
  }, { _id: false });

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    slug: { type: String, required: true, trim: true, index: true },
    sku: { type: String, required: true, trim: true, unique: true },
    discountType: { type: String, enum: ALLOWED_DISCOUNT_TYPES, default: "percentage" },
    discountValue: { type: Number, default: 0, min: 0 },
    taxType: { type: String, enum: ALLOWED_TAX_TYPES, default: "inclusive" },
    taxValue: { type: Number, default: 0, min: 0 },
    description: { type: String, required: false, default: "", trim: true },
    shortDescription: { type: String, default: "", trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: "SubCategory", required: true },
    childCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChildCategory",
      default: null,
    },
    moq: { type: Number, default: 1, min: 1 },
    price: { type: Number, required: true, min: 1, default: 1 },
    stock: { type: Number, default: 0, min: 0 },
    variantType: { type: String, enum: ALLOWED_VARIANT_TYPES, default: "single" },
    thumbnail: { type: String, required: true, trim: true },
    images: { type: [String], default: [] },
    videos: { type: [String], default: [] },
    combinations: { type: [VariantCombinationSchema], default: [] },
    attributeTitles: { type: [mongoose.Schema.Types.ObjectId], ref: "AttributeTitle", default: [] },
    role: { type: String, enum: ALLOWED_ROLES, default: "Admin", trim: true },
    addedById: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "role" },
    adminApproved: { type: Boolean, default: false },
    /** When true, admin set product inactive — vendor cannot reactivate until admin does. */
    statusLockedByAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ALLOWED_STATUS, default: "active", index: true },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

productSchema.pre("validate", function normalizeVariantPrices(next) {
  if (!Array.isArray(this.combinations)) return next();

  if (this.variantType === "single" && this.combinations.length > 0) {
    return next(new Error("Single variant product cannot have combinations"));
  }

  if (this.variantType === "multi" && this.combinations.length === 0) {
    return next(new Error("Multi variant product must include combinations"));
  }

  for (const combination of this.combinations) {
    if (combination.price < 1) {
      return next(new Error("Combination price cannot be less than 1"));
    }
  }
  return next();
});

module.exports = mongoose.model("Product", productSchema);
