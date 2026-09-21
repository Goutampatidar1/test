const VendorPlan = require("../models/other/vendorPlan");

const PLAN_TYPE_LABELS = {
  banner: "Banner",
  get_verified: "Get Verified",
  product_presence_first: "Product Presence First",
};

/** Calendar-day inclusive window (admin date inputs are usually midnight UTC). */
function startOfUtcDay(value = new Date()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(value = new Date()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function isPlanInDateRange(doc, now = new Date()) {
  if (!doc?.startDate || !doc?.endDate) return false;
  const start = new Date(doc.startDate);
  const end = new Date(doc.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start.getTime() <= endOfUtcDay(now).getTime() && end.getTime() >= startOfUtcDay(now).getTime();
}

function toPublicVendorPlan(doc, now = new Date()) {
  if (!doc) return null;
  const inRange = isPlanInDateRange(doc, now);
  return {
    _id: doc._id,
    name: doc.name,
    planType: doc.planType,
    planTypeLabel: PLAN_TYPE_LABELS[doc.planType] || doc.planType,
    vendorType: doc.vendorType,
    price: Number(doc.price) || 0,
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
    presenceTopLimit: Number(doc.presenceTopLimit) || 100,
    presenceMode: doc.presenceMode || "random",
    status: doc.status,
    /** true when today is within startDate–endDate (inclusive) */
    isAvailable: inRange,
    canSubscribe: inRange && doc.status === "active",
  };
}

/**
 * All active plans for this vendor type (ecom/venue + both).
 * Does not hide plans outside the date window — those are returned with isAvailable=false.
 */
async function listActiveVendorPlans({ vendorType = "ecom", availableOnly = false } = {}) {
  const normalized = String(vendorType || "ecom").trim().toLowerCase();
  const now = new Date();
  const filter = {
    status: "active",
    vendorType: { $in: [normalized, "both"] },
  };

  if (availableOnly) {
    filter.startDate = { $lte: endOfUtcDay(now) };
    filter.endDate = { $gte: startOfUtcDay(now) };
  }

  const plans = await VendorPlan.find(filter).sort({ planType: 1, createdAt: -1 }).lean();
  return plans.map((doc) => toPublicVendorPlan(doc, now)).filter(Boolean);
}

module.exports = {
  PLAN_TYPE_LABELS,
  toPublicVendorPlan,
  listActiveVendorPlans,
  isPlanInDateRange,
  startOfUtcDay,
  endOfUtcDay,
};
