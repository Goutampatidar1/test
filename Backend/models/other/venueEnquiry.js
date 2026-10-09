const mongoose = require("mongoose");

const ENQUIRY_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "converted",
];
const ENQUIRY_SOURCES = ["standard", "quick"];

const venueEnquirySchema = new mongoose.Schema(
  {
    enquiryNumber: { type: String, required: true, unique: true, trim: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    venue: { type: mongoose.Schema.Types.ObjectId, ref: "Venue", required: true, index: true },
    /** Owning VenueVendor (resolved from venue.addedById); null for admin-owned venues. */
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "VenueVendor", default: null, index: true },

    source: { type: String, enum: ENQUIRY_SOURCES, default: "standard" },
    status: { type: String, enum: ENQUIRY_STATUSES, default: "pending", index: true },

    bookingType: { type: String, enum: ["hourly", "full_day"], default: "full_day" },
    /** YYYY-MM-DD strings, sorted. */
    bookingDates: { type: [String], default: [] },
    startTime: { type: String, default: "", trim: true },
    endTime: { type: String, default: "", trim: true },
    durationHours: { type: Number, default: 0, min: 0 },
    slotLabel: { type: String, default: "", trim: true },

    guestCount: { type: Number, default: 0, min: 0 },
    eventType: { type: String, default: "", trim: true, maxlength: 80 },
    message: { type: String, default: "", trim: true, maxlength: 1000 },

    contact: {
      name: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true },
      countryCode: { type: String, default: "+91", trim: true },
      address: { type: String, default: "", trim: true },
    },
    preferredCallTime: { type: String, default: "", trim: true, maxlength: 80 },

    /** Pricing snapshot at enquiry time (informational; recalculated on booking). */
    quote: { type: mongoose.Schema.Types.Mixed, default: {} },

    vendorNote: { type: String, default: "", trim: true, maxlength: 1000 },
    rejectionReason: { type: String, default: "", trim: true, maxlength: 500 },
    cancellationReason: { type: String, default: "", trim: true, maxlength: 500 },

    responseDueAt: { type: Date, default: null, index: true },
    respondedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    /** After acceptance the user must book before this time; dates are held until then. */
    holdExpiresAt: { type: Date, default: null, index: true },
    convertedAt: { type: Date, default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "VenueOrder", default: null },
  },
  { timestamps: true, versionKey: false }
);

venueEnquirySchema.index({ vendor: 1, status: 1, createdAt: -1 });
venueEnquirySchema.index({ user: 1, createdAt: -1 });
venueEnquirySchema.index({ venue: 1, status: 1, holdExpiresAt: 1 });

venueEnquirySchema.statics.STATUSES = ENQUIRY_STATUSES;

module.exports = mongoose.model("VenueEnquiry", venueEnquirySchema);
module.exports.ENQUIRY_STATUSES = ENQUIRY_STATUSES;
