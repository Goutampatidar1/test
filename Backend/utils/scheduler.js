/**
 * Background jobs (node-cron). Started once from server.js after the database connects.
 * Disable with DISABLE_SCHEDULER=true (e.g. when running several instances and one is the worker).
 *
 * Every job is wrapped so an error or an overlapping run never crashes the server.
 */
const VendorPlanSubscription = require("../models/other/vendorPlanSubscription");
const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const { getFeatureSettings } = require("./appFeatureSettings");
const { expireStaleEnquiries } = require("./venueEnquiry");
const { expireLapsedPhonePlans } = require("./phonePlan");
const { expireFinishedBanners } = require("./bannerQuery");
const { refreshProfileScore } = require("./profileCompletion");
const { queueAppNotification } = require("./appNotify");

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_REMINDER_DAYS = 3;
const PROFILE_REFRESH_BATCH = 2000;

const running = new Set();

function guarded(name, fn) {
  return async () => {
    if (running.has(name)) return;
    running.add(name);
    const startedAt = Date.now();
    try {
      const result = await fn();
      if (result && Object.values(result).some(Boolean)) {
        console.log(`[scheduler] ${name}`, JSON.stringify(result), `${Date.now() - startedAt}ms`);
      }
    } catch (error) {
      console.error(`[scheduler] ${name} failed:`, error?.message || error);
    } finally {
      running.delete(name);
    }
  };
}

/** Every minute: keep time-sensitive state tidy. */
async function minuteJob() {
  await getFeatureSettings(); // keep the settings cache warm for sync readers
  const [enquiries, banners] = await Promise.all([expireStaleEnquiries(), expireFinishedBanners()]);
  return {
    enquiriesExpired: typeof enquiries === "number" ? enquiries : enquiries?.expired ?? enquiries?.modifiedCount ?? 0,
    bannersExpired: banners,
  };
}

/** Plan housekeeping + "expiring soon" reminders. */
async function planJob() {
  const lapsed = await expireLapsedPhonePlans();

  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRY_REMINDER_DAYS * DAY_MS);
  const expiring = await VendorPlanSubscription.find({
    status: "active",
    endDate: { $gte: now, $lte: soon },
    expiryNotifiedAt: null,
    price: { $gt: 0 }, // do not nag about free trials
  })
    .limit(500)
    .lean();

  for (const sub of expiring) {
    const days = Math.max(1, Math.ceil((new Date(sub.endDate).getTime() - now.getTime()) / DAY_MS));
    queueAppNotification({
      recipientType: sub.ownerType === "venue" ? "venueVendor" : "vendor",
      recipientId: sub.owner,
      type: "plan_expiring",
      title: `${sub.planName || "Your plan"} ends soon`,
      message: `Your plan ends in ${days} day${days > 1 ? "s" : ""}. Renew to keep your benefits.`,
      metadata: { subscriptionId: String(sub._id), planType: sub.planType, screen: "plans" },
    });
    await VendorPlanSubscription.updateOne({ _id: sub._id }, { $set: { expiryNotifiedAt: now } });
  }

  return { phoneSubscriptionsExpired: lapsed.subscriptions, remindersSent: expiring.length };
}

/** Nightly: recompute profile scores so ranking, benefits and the free Show Number trial stay current. */
async function profileJob() {
  let refreshed = 0;
  for (const [ownerType, Model] of [
    ["ecom", Vendor],
    ["venue", VenueVendor],
  ]) {
    const vendors = await Model.find({ status: "active", approvalStatus: "approved" })
      .select("_id")
      .sort({ updatedAt: -1 })
      .limit(PROFILE_REFRESH_BATCH)
      .lean();
    for (const vendor of vendors) {
      try {
        await refreshProfileScore(ownerType, vendor._id);
        refreshed += 1;
      } catch (error) {
        console.error("[scheduler] profile refresh failed:", error?.message || error);
      }
    }
  }
  return { profilesRefreshed: refreshed };
}

let started = false;

function startScheduler() {
  if (started) return;
  if (String(process.env.DISABLE_SCHEDULER || "").toLowerCase() === "true") {
    console.log("[scheduler] disabled via DISABLE_SCHEDULER");
    return;
  }
  started = true;

  let cron;
  try {
    // eslint-disable-next-line global-require
    cron = require("node-cron");
  } catch (error) {
    console.error("[scheduler] node-cron missing, background jobs are off:", error.message);
    return;
  }

  const jobs = {
    minute: guarded("minute", minuteJob),
    plans: guarded("plans", planJob),
    profiles: guarded("profiles", profileJob),
  };

  cron.schedule("* * * * *", jobs.minute);
  cron.schedule("*/15 * * * *", jobs.plans);
  cron.schedule("30 3 * * *", jobs.profiles);

  // run the cheap jobs once right away so a restart never leaves stale state behind
  setImmediate(() => {
    jobs.minute();
    jobs.plans();
  });

  console.log("[scheduler] started");
}

module.exports = { startScheduler, minuteJob, planJob, profileJob };
