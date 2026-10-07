const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const User = require("../models/entity/user");
const Product = require("../models/other/product");
const Venue = require("../models/other/venue");
const ProductVideoFeed = require("../models/other/productVideoFeed");
const VenueVideoFeed = require("../models/other/venueVideoFeed");
const VenueEnquiry = require("../models/other/venueEnquiry");
const AppError = require("./AppError");
const { asyncHandler } = require("./asyncHandler");
const { sendSuccess } = require("./apiResponse");
const { getFeatureSettings } = require("./appFeatureSettings");
const { listActiveVendorPlans, PLAN_TYPE_LABELS } = require("./vendorPlans");
const { getOwnerSubscriptions } = require("./vendorPlanSubscription");
const { computeProfileCompletion } = require("./profileCompletion");
const { describePhonePlanState } = require("./phonePlan");

const PLAN_PITCH = {
  show_phone: "Let customers call you directly - your number stays hidden without this plan.",
  get_verified: "Show a verified badge and appear in the Get Verified section on the home screen.",
  banner: "Put your own banner on the home screen of the user app.",
  product_presence_first: "Get one of your products featured on the home screen.",
};

function apiPrefix(ownerType) {
  return ownerType === "venue" ? "/api/venue-vendor" : "/api/vendor";
}

function planCard(ownerType, plan) {
  const prefix = apiPrefix(ownerType);
  return {
    ...plan,
    action: {
      type: "subscribe_plan",
      label: plan.price > 0 ? `Buy for ₹${plan.price}` : "Activate free",
      method: "POST",
      path: `${prefix}/plans/${plan._id}/subscribe`,
    },
  };
}

/**
 * Personalised "recommended for you" feed for the vendor apps.
 * Every card has a stable `key`, a `screen` for in-app navigation and, where relevant, an API `action`.
 */
async function buildVendorRecommendations({ ownerType, vendor }) {
  const prefix = apiPrefix(ownerType);
  const features = await getFeatureSettings();
  const isVenue = ownerType === "venue";

  const [plans, subs, completion] = await Promise.all([
    listActiveVendorPlans({ vendorType: isVenue ? "venue" : "ecom", availableOnly: true }),
    getOwnerSubscriptions(ownerType, vendor._id),
    computeProfileCompletion({
      ecom: isVenue ? null : vendor,
      service: isVenue ? vendor : null,
      variant: isVenue ? "service" : "ecom",
    }),
  ]);

  const activeByType = new Map();
  subs.forEach((sub) => {
    const existing = activeByType.get(sub.planType);
    if (!existing || new Date(sub.endDate) > new Date(existing.endDate)) activeByType.set(sub.planType, sub);
  });

  // group plan tiers by type
  const grouped = new Map();
  plans.forEach((plan) => {
    if (!plan.canSubscribe) return;
    if (!grouped.has(plan.planType)) grouped.set(plan.planType, []);
    grouped.get(plan.planType).push(planCard(ownerType, plan));
  });
  const planGroups = [...grouped.entries()].map(([planType, tiers]) => ({
    planType,
    label: PLAN_TYPE_LABELS[planType] || planType,
    pitch: PLAN_PITCH[planType] || "",
    isActive: activeByType.has(planType),
    activeUntil: activeByType.get(planType)?.endDate ?? null,
    daysRemaining: activeByType.get(planType)?.daysRemaining ?? 0,
    tiers: tiers.sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price),
  }));

  const cards = [];
  const add = (card) => cards.push({ screen: null, action: null, ...card });

  // 1. Show Number plan
  const phoneState = describePhonePlanState(vendor);
  const phoneGroup = planGroups.find((g) => g.planType === "show_phone");
  if (phoneState.planRequired && phoneGroup) {
    if (!phoneState.hasActivePlan) {
      add({
        key: "buy_phone_plan",
        type: "plan",
        priority: 100,
        title: "Your phone number is hidden",
        description: PLAN_PITCH.show_phone,
        screen: "plans",
        planType: "show_phone",
        cta: { label: "See Show Number plans", screen: "plans", planType: "show_phone" },
      });
    } else if (phoneState.daysRemaining <= 7) {
      add({
        key: "renew_phone_plan",
        type: "plan",
        priority: 95,
        title: `Show Number plan ends in ${phoneState.daysRemaining} day(s)`,
        description: "Renew so customers can keep calling you.",
        screen: "plans",
        planType: "show_phone",
        cta: { label: "Renew now", screen: "plans", planType: "show_phone" },
      });
    }
  }

  // 2. Profile completion
  if (completion.percent < 100) {
    const next = completion.benefits?.nextBenefit;
    add({
      key: "complete_profile",
      type: "profile",
      priority: 90,
      title: `Your profile is ${completion.percent}% complete`,
      description: next
        ? `${next.title}: reach ${next.minPercent}% to unlock - ${next.description}`
        : completion.benefits?.headline || "Complete your profile to rank higher.",
      screen: "profile_completion",
      progress: completion.percent,
      cta: { label: "Complete profile", screen: "profile_completion" },
    });
  }

  if (isVenue) {
    const [venues, withoutDiscount, pendingEnquiries, videos] = await Promise.all([
      Venue.countDocuments({ role: "VenueVendor", addedById: vendor._id, status: "active" }),
      Venue.countDocuments({
        role: "VenueVendor",
        addedById: vendor._id,
        status: "active",
        $or: [{ discountType: null }, { discountType: "" }, { discountType: { $exists: false } }, { discountValue: { $lte: 0 } }],
      }),
      VenueEnquiry.countDocuments({ vendor: vendor._id, status: "pending" }),
      VenueVideoFeed.countDocuments({ venueVendor: vendor._id, status: "active" }),
    ]);

    if (pendingEnquiries > 0) {
      add({
        key: "pending_enquiries",
        type: "enquiry",
        priority: 98,
        title: `${pendingEnquiries} ${pendingEnquiries > 1 ? "enquiries" : "enquiry"} waiting for your reply`,
        description: "Customers book faster when you reply quickly.",
        screen: "enquiries",
        cta: { label: "View enquiries", screen: "enquiries" },
      });
    }
    if (venues === 0) {
      add({
        key: "add_first_service",
        type: "listing",
        priority: 85,
        title: "Add your first service",
        description: "Only a name, photo, category and price are needed to go live.",
        screen: "add_venue",
        cta: { label: "Add service", screen: "add_venue" },
      });
    } else if (withoutDiscount > 0) {
      add({
        key: "add_discount",
        type: "discount",
        priority: 60,
        title: "Offer a discount",
        description: `${withoutDiscount} of your services have no offer. Discounts notify interested customers.`,
        screen: "venue_discount",
        cta: { label: "Set a discount", screen: "venue_discount" },
        suggestions: [5, 10, 15, 20, 25],
      });
    }
    if (features.videoEnabledVendor !== false && vendor.videoEnabled !== false && venues > 0 && videos === 0) {
      add({
        key: "add_video",
        type: "video",
        priority: 50,
        title: "Add a video",
        description: "Short videos get shown on the user app home screen.",
        screen: "videos",
        cta: { label: "Upload video", screen: "videos" },
      });
    }
  } else {
    const [products, discountedNotInHotDeals, videos] = await Promise.all([
      Product.countDocuments({ role: "Vendor", addedById: vendor._id, status: { $ne: "deleted" } }),
      Product.countDocuments({
        role: "Vendor",
        addedById: vendor._id,
        status: "active",
        discountValue: { $gt: 0 },
        "hotDeal.optIn": { $ne: true },
      }),
      ProductVideoFeed.countDocuments({ vendor: vendor._id, status: "active" }),
    ]);

    if (products === 0) {
      add({
        key: "add_first_product",
        type: "listing",
        priority: 85,
        title: "Add your first product",
        description: "Products from approved vendors go live right away.",
        screen: "add_product",
        cta: { label: "Add product", screen: "add_product" },
      });
    }
    if (features.hotDealsEnabled !== false && discountedNotInHotDeals > 0) {
      add({
        key: "join_hot_deals",
        type: "hot_deal",
        priority: 70,
        title: "Put your discounted products in Hot Deals",
        description: `${discountedNotInHotDeals} discounted product(s) can be featured on the home screen.`,
        screen: "products",
        action: { type: "hot_deal_opt_in", method: "POST", path: `${prefix}/products/:productId/hot-deal` },
        cta: { label: "Choose products", screen: "products", filter: "discounted" },
      });
    }
    if (features.videoEnabledVendor !== false && vendor.videoEnabled !== false && products > 0 && videos === 0) {
      add({
        key: "add_video",
        type: "video",
        priority: 50,
        title: "Add a product video",
        description: "Short videos get shown on the user app home screen.",
        screen: "videos",
        cta: { label: "Upload video", screen: "videos" },
      });
    }
  }

  // 3. Other plans the vendor doesn't have
  planGroups
    .filter((g) => g.planType !== "show_phone" && !g.isActive)
    .forEach((g) => {
      add({
        key: `plan_${g.planType}`,
        type: "plan",
        priority: 40,
        title: g.label,
        description: g.pitch,
        screen: "plans",
        planType: g.planType,
        fromPrice: Math.min(...g.tiers.map((t) => t.price)),
        cta: { label: "View plans", screen: "plans", planType: g.planType },
      });
    });

  cards.sort((a, b) => b.priority - a.priority);

  return {
    summary: {
      profilePercent: completion.percent,
      activePlans: subs.map((s) => ({
        planType: s.planType,
        label: s.planTypeLabel,
        endDate: s.endDate,
        daysRemaining: s.daysRemaining,
      })),
      phone: phoneState,
    },
    recommendations: cards,
    plans: planGroups,
  };
}

function makeRecommendationHandlers(ownerType) {
  const Model = ownerType === "venue" ? VenueVendor : Vendor;
  const list = asyncHandler(async (req, res) => {
    const vendor = await Model.findById(req.user._id).lean();
    if (!vendor) throw new AppError("Account not found", 404);
    sendSuccess(res, "Recommendations fetched", await buildVendorRecommendations({ ownerType, vendor }));
  });
  return { list };
}

/** PUT/DELETE device (FCM) token for the vendor apps. */
function makeDeviceTokenHandlers(getModel) {
  const set = asyncHandler(async (req, res) => {
    const token = String(req.body?.fcmToken ?? req.body?.fcm_id ?? req.body?.token ?? "").trim();
    if (!token) throw new AppError("fcmToken is required", 400);
    if (token.length > 4096) throw new AppError("fcmToken is too long", 400);

    const Own = getModel();
    // a device belongs to one account at a time
    await Promise.all(
      [User, Vendor, VenueVendor].map((M) =>
        M.updateMany(
          { fcm_id: token, ...(M === Own ? { _id: { $ne: req.user._id } } : {}) },
          { $set: { fcm_id: null } }
        )
      )
    );
    await Own.updateOne({ _id: req.user._id }, { $set: { fcm_id: token } });
    sendSuccess(res, "Device token saved", { registered: true });
  });

  const clear = asyncHandler(async (req, res) => {
    await getModel().updateOne({ _id: req.user._id }, { $set: { fcm_id: null } });
    sendSuccess(res, "Device token removed", { registered: false });
  });

  return { set, clear };
}

module.exports = { buildVendorRecommendations, makeRecommendationHandlers, makeDeviceTokenHandlers };
