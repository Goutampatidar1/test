const mongoose = require("mongoose");

/**
 * Admin-defined "Hot deal" condition. A product shows in Hot Deals when it is active+approved,
 * in stock, and matches at least one active rule (and, if the rule demands it, the vendor opted in).
 */
const hotDealRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    badge: { type: String, default: "Hot deal", trim: true, maxlength: 30 },

    /** Conditions (all that are set must match). */
    minDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    minPrice: { type: Number, default: 0, min: 0 },
    maxPrice: { type: Number, default: 0, min: 0 }, // 0 = no upper bound
    minStock: { type: Number, default: 1, min: 0 },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    subCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: "SubCategory" }],
    vendors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }],

    /** Only products whose vendor opted in at create/update time. */
    requireOptIn: { type: Boolean, default: true },
    /** Opted-in products that already satisfy the rule skip the approval queue. */
    autoApprove: { type: Boolean, default: false },

    /** Optional daily window ("hot deals of the day"), 24h clock in server local time. */
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    dailyStartHour: { type: Number, default: null, min: 0, max: 23 },
    dailyEndHour: { type: Number, default: null, min: 0, max: 24 },

    limit: { type: Number, default: 12, min: 1, max: 100 },
    priority: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
  },
  { timestamps: true, versionKey: false }
);

hotDealRuleSchema.index({ status: 1, priority: -1 });

module.exports = mongoose.model("HotDealRule", hotDealRuleSchema);
