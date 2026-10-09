const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const VendorPlan = require("../models/other/vendorPlan");
const VendorPlanSubscription = require("../models/other/vendorPlanSubscription");
const AppError = require("./AppError");
const { peekFeatureSettings } = require("./appFeatureSettings");

const DAY_MS = 24 * 60 * 60 * 1000;
const PHONE_PLAN_TYPE = "show_phone";
const TRIAL_PLAN_NAME = "Show Number - Free Trial";

function modelForOwner(ownerType) {
  return ownerType === "venue" ? VenueVendor : Vendor;
}

function hasActivePhonePlan(vendor, now = new Date()) {
  const until = vendor?.phonePlanUntil ? new Date(vendor.phonePlanUntil) : null;
  return Boolean(until && until.getTime() >= now.getTime());
}

/** Is this vendor's phone allowed to be shown to users right now (plan rule only)? */
function isPhonePlanSatisfied(vendor, now = new Date()) {
  const settings = peekFeatureSettings();
  if (!settings.phonePlanRequired) return true;
  return hasActivePhonePlan(vendor, now);
}

/** Recompute vendor.phonePlanUntil from the active subscription. Call after any show_phone change. */
async function syncPhonePlanState(ownerType, ownerId) {
  const now = new Date();
  const active = await VendorPlanSubscription.findOne({
    ownerType,
    owner: ownerId,
    planType: PHONE_PLAN_TYPE,
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ endDate: -1 })
    .select("endDate")
    .lean();

  await modelForOwner(ownerType).updateOne(
    { _id: ownerId },
    { $set: { phonePlanUntil: active?.endDate ?? null } }
  );
  return active?.endDate ?? null;
}

async function ensureTrialPlan() {
  let plan = await VendorPlan.findOne({ planType: PHONE_PLAN_TYPE, name: TRIAL_PLAN_NAME });
  if (!plan) {
    const now = new Date();
    plan = await VendorPlan.create({
      name: TRIAL_PLAN_NAME,
      planType: PHONE_PLAN_TYPE,
      vendorType: "both",
      price: 0,
      startDate: now,
      endDate: new Date(now.getTime() + 20 * 365 * DAY_MS),
      durationDays: 0,
      description: "Complimentary trial granted by the platform.",
      status: "inactive", // never listed for purchase
    });
  }
  return plan;
}

/**
 * Grant a complimentary Show Number window. Skips vendors who already have an active plan
 * or who already received a trial. Returns the subscription, or null when skipped.
 */
async function grantPhoneTrial(ownerType, ownerId, days, { reason = "trial" } = {}) {
  const trialDays = Math.floor(Number(days) || 0);
  if (trialDays <= 0) return null;

  const existingActive = await VendorPlanSubscription.findOne({
    ownerType,
    owner: ownerId,
    planType: PHONE_PLAN_TYPE,
    status: "active",
  })
    .select("_id")
    .lean();
  if (existingActive) return null;

  const trialPlan = await ensureTrialPlan();
  // one trial per reason (e.g. migration grace and profile-complete are separate gifts)
  const alreadyTrialled = await VendorPlanSubscription.exists({
    ownerType,
    owner: ownerId,
    plan: trialPlan._id,
    planName: `${TRIAL_PLAN_NAME} (${reason})`,
  });
  if (alreadyTrialled) return null;

  const now = new Date();
  const subscription = await VendorPlanSubscription.create({
    ownerType,
    owner: ownerId,
    plan: trialPlan._id,
    planType: PHONE_PLAN_TYPE,
    planName: `${TRIAL_PLAN_NAME} (${reason})`,
    price: 0,
    startDate: now,
    endDate: new Date(now.getTime() + trialDays * DAY_MS),
    status: "active",
    paidVia: "free",
    paidAt: now,
  });
  await syncPhonePlanState(ownerType, ownerId);
  return subscription;
}

/** Clear phonePlanUntil for vendors whose Show Number window has passed. Used by the scheduler. */
async function expireLapsedPhonePlans(now = new Date()) {
  const lapsed = await VendorPlanSubscription.updateMany(
    { planType: PHONE_PLAN_TYPE, status: "active", endDate: { $lt: now } },
    { $set: { status: "expired" } }
  );
  const [vendors, venueVendors] = await Promise.all([
    Vendor.updateMany({ phonePlanUntil: { $lt: now } }, { $set: { phonePlanUntil: null } }),
    VenueVendor.updateMany({ phonePlanUntil: { $lt: now } }, { $set: { phonePlanUntil: null } }),
  ]);
  return {
    subscriptions: lapsed.modifiedCount || 0,
    vendors: vendors.modifiedCount || 0,
    venueVendors: venueVendors.modifiedCount || 0,
  };
}

/** Summary card for the vendor app: status, expiry, and why the phone is (not) visible. */
function describePhonePlanState(vendor, now = new Date()) {
  const settings = peekFeatureSettings();
  const active = hasActivePhonePlan(vendor, now);
  const until = vendor?.phonePlanUntil ? new Date(vendor.phonePlanUntil) : null;
  return {
    planRequired: settings.phonePlanRequired,
    hasActivePlan: active,
    expiresAt: active ? until : null,
    daysRemaining: active ? Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS)) : 0,
    canToggle: !settings.phonePlanRequired || active,
    phoneVisibleToUsers:
      vendor?.showPhoneOnApp !== false && (!settings.phonePlanRequired || active),
  };
}

/** Turning the phone ON needs an active plan (when required). Turning it OFF is always allowed. */
function canSetPhoneVisible(vendor, wantsVisible) {
  if (wantsVisible !== true) return true;
  if (!peekFeatureSettings().phonePlanRequired) return true;
  return hasActivePhonePlan(vendor);
}

function assertCanShowPhone(vendor, wantsVisible) {
  if (canSetPhoneVisible(vendor, wantsVisible)) return;
  throw new AppError(
    "Buy a Show Number plan to make your phone number visible to customers.",
    403,
    "PHONE_PLAN_REQUIRED"
  );
}

module.exports = {
  assertCanShowPhone,
  canSetPhoneVisible,
  PHONE_PLAN_TYPE,
  hasActivePhonePlan,
  isPhonePlanSatisfied,
  syncPhonePlanState,
  grantPhoneTrial,
  expireLapsedPhonePlans,
  describePhonePlanState,
};
