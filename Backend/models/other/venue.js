const mongoose = require("mongoose");

const ALLOWED_STATUS = ["active", "inactive"];
const ALLOWED_ROLES = ["Admin", "VenueVendor", "Vendor"];

const venueSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    shortDescription: { type: String, default: "", trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: "SubCategory" },
    address: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    pincode: { type: String, default: "", trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    thumbnail: { type: String, required: true, trim: true },
    images: { type: [String], default: [] },
    amenities: [{ type: mongoose.Schema.Types.ObjectId, ref: "Amenity" }],
    capacity: { type: Number, default: 0, min: 0 },
    carpetArea: { type: Number, default: 0, min: 0 },
    basePrice: { type: Number, default: 0, min: 0 },
    dayPrice: { type: Number, default: 0, min: 0 },
    hourlyPrice: { type: Number, default: 0, min: 0 },
    /** Primary rate type shown to customers: full booking, hourly, or per day. */
    priceType: {
      type: String,
      enum: ["full", "hourly", "day"],
      default: "full",
    },
    /** Flat advance/token amount due at booking (₹). Preferred over percentage when set. */
    tokenAmount: { type: Number, default: 0, min: 0 },
    /** Advance/token due at booking confirmation (% of grand total, 1–99). */
    tokenAmountPercentage: { type: Number, min: 1, max: 99 },
    role: { type: String, enum: ALLOWED_ROLES, default: "Admin", trim: true },
    addedById: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "role" },
    adminApproved: { type: Boolean, default: false },
    status: { type: String, enum: ALLOWED_STATUS, default: "active" },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Venue", venueSchema);
