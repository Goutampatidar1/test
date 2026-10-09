/**
 * Show Number plan migration (safe to re-run).
 *
 *   node scripts/migratePhonePlan.js                 # create default tiers + grandfather vendors for 30 days
 *   node scripts/migratePhonePlan.js --grace-days=60 # custom grace period
 *   node scripts/migratePhonePlan.js --no-grace      # only create the plan tiers
 *   node scripts/migratePhonePlan.js --dry-run       # print what would change
 *
 * Grace: existing vendors whose phone is currently visible keep it visible for N days so
 * numbers do not vanish the moment the plan requirement goes live.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
  override: true,
});

const mongoose = require("mongoose");
const config = require("../config");
const { Vendor, VenueVendor } = require("../models");
const VendorPlan = require("../models/other/vendorPlan");
const { grantPhoneTrial } = require("../utils/phonePlan");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const NO_GRACE = args.includes("--no-grace");
const graceArg = args.find((a) => a.startsWith("--grace-days="));
const GRACE_DAYS = graceArg ? Math.max(1, parseInt(graceArg.split("=")[1], 10) || 30) : 30;

const TIERS = [
  {
    name: "Show Number - Monthly",
    durationDays: 30,
    price: 199,
    sortOrder: 1,
    badge: "",
    isRecommended: false,
    description: "Let customers call you directly for 30 days.",
    benefits: ["Phone number visible on your listings", "Direct calls from customers"],
  },
  {
    name: "Show Number - Quarterly",
    durationDays: 90,
    price: 499,
    sortOrder: 2,
    badge: "Popular",
    isRecommended: true,
    description: "3 months of direct customer calls at a lower monthly cost.",
    benefits: [
      "Phone number visible on your listings",
      "Direct calls from customers",
      "Save over 15% vs monthly",
    ],
  },
  {
    name: "Show Number - Yearly",
    durationDays: 365,
    price: 1499,
    sortOrder: 3,
    badge: "Best value",
    isRecommended: false,
    description: "A full year of direct customer calls at the best price.",
    benefits: [
      "Phone number visible on your listings",
      "Direct calls from customers",
      "Save over 35% vs monthly",
    ],
  },
];

async function ensureTiers() {
  const now = new Date();
  const farEnd = new Date(now.getTime() + 20 * 365 * 24 * 60 * 60 * 1000);
  let created = 0;

  for (const tier of TIERS) {
    const exists = await VendorPlan.exists({ planType: "show_phone", name: tier.name });
    if (exists) continue;
    created += 1;
    console.log(`${DRY_RUN ? "[dry-run] would create" : "Creating"} plan: ${tier.name}`);
    if (DRY_RUN) continue;
    await VendorPlan.create({
      ...tier,
      planType: "show_phone",
      vendorType: "both",
      startDate: now,
      endDate: farEnd,
      status: "active",
    });
  }
  return created;
}

async function grandfather(Model, ownerType, label) {
  const rows = await Model.find({
    showPhoneOnApp: { $ne: false },
    $or: [{ phonePlanUntil: null }, { phonePlanUntil: { $exists: false } }],
  })
    .select("_id")
    .lean();

  console.log(`${label}: ${rows.length} vendor(s) with a visible phone and no plan`);
  if (DRY_RUN || NO_GRACE) return 0;

  let granted = 0;
  for (const row of rows) {
    const sub = await grantPhoneTrial(ownerType, row._id, GRACE_DAYS, { reason: "migration grace" });
    if (sub) granted += 1;
  }
  return granted;
}

async function main() {
  if (!config.mongodbUri) throw new Error("MONGODB_URI is not set in Backend/.env");
  await mongoose.connect(config.mongodbUri);
  console.log("Connected database:", mongoose.connection.name);

  const created = await ensureTiers();
  const ecom = await grandfather(Vendor, "ecom", "Ecom vendors");
  const venue = await grandfather(VenueVendor, "venue", "Venue vendors");

  console.log(
    `Done. Plans created: ${created}. Grace granted: ${ecom + venue} (${GRACE_DAYS} days).${
      DRY_RUN ? " (dry run: nothing written)" : ""
    }`
  );
}

main()
  .catch((err) => {
    console.error("migratePhonePlan failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
