const PromotionPlan = require("../models/other/promotionPlan");
const PromotionSubscription = require("../models/other/promotionSubscription");
const City = require("../models/other/city");
const SubDistrict = require("../models/other/subDistrict");
const Product = require("../models/other/product");
const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const Venue = require("../models/other/venue");
const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { createRazorpayOrder, verifyRazorpayCheckoutPayment } = require("./razorpay");
const { activePublicVendorFilter } = require("./publicVendorVisibility");
const {
  activePublicProductBaseFilter,
  toPublicProductListCard,
} = require("./publicProductList");
const { getVendorRatingStatsMap } = require("./nearbyVendors");

const PLAN_TYPE_LABELS = {
  banner: "Banner Promotion",
  get_verified: "Get Verified",
  product_presence_first: "Product Presence First",
};

const DURATION_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function startOfUtcDay(value = new Date()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addDaysUtc(startDate, days) {
  const start = startOfUtcDay(startDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Number(days));
  // expiry is start + durationDays (exclusive end-of-day of last day = start of day after last day)
  // Spec: Weekly from 25 Aug → expiry 01 Sep (start + 7 days)
  return end;
}

function parseStartDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new AppError("Start date is required", 400);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new AppError("Start date is invalid", 400);
  return startOfUtcDay(date);
}

function resolveDurationOption(plan, durationType) {
  const type = String(durationType || "").trim().toLowerCase();
  const option = (plan.durationOptions || []).find((row) => row.type === type);
  if (!option) {
    throw new AppError(`Duration option "${durationType}" is not available on this plan`, 400);
  }
  return {
    type: option.type,
    durationDays: Number(option.durationDays),
    price: Number(option.price) || 0,
  };
}

function toPublicPromotionPlan(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    planType: doc.planType,
    planTypeLabel: PLAN_TYPE_LABELS[doc.planType] || doc.planType,
    durationOptions: (doc.durationOptions || []).map((row) => ({
      type: row.type,
      typeLabel: DURATION_LABELS[row.type] || row.type,
      durationDays: Number(row.durationDays),
      price: Number(row.price) || 0,
    })),
    presenceTopLimit: doc.presenceTopLimit ?? null,
    vendorType: doc.vendorType || "ecom",
    vendorTypeLabel: doc.vendorType === "venue" ? "Venue vendor" : "E-commerce vendor",
    status: doc.status,
  };
}

function resolveRuntimeStatus(sub, now = new Date()) {
  if (!sub) return null;
  if (["rejected", "cancelled", "pending_payment", "pending_review"].includes(sub.status)) {
    return sub.status;
  }
  if (sub.approvalStatus !== "approved") return sub.status;
  const today = startOfUtcDay(now);
  const start = startOfUtcDay(sub.startDate);
  const expiry = startOfUtcDay(sub.expiryDate);
  if (expiry.getTime() <= today.getTime()) return "expired";
  if (start.getTime() > today.getTime()) return "scheduled";
  return "active";
}

async function expireDueSubscriptions(filter = {}) {
  const today = startOfUtcDay(new Date());
  await PromotionSubscription.updateMany(
    {
      ...filter,
      approvalStatus: "approved",
      status: { $in: ["active", "scheduled"] },
      expiryDate: { $lte: today },
    },
    { $set: { status: "expired" } }
  );
}

function toPublicPromotionSubscription(doc, baseUrl = "") {
  if (!doc) return null;
  const runtimeStatus = resolveRuntimeStatus(doc);
  return {
    _id: doc._id,
    subscriptionId: doc._id,
    ownerType: doc.ownerType || "ecom",
    vendorId: doc.vendor,
    venueVendorId: doc.venueVendor || null,
    targetVenueId: doc.targetVenueId || null,
    planId: doc.plan,
    planName: doc.planName || "",
    planType: doc.planType,
    planTypeLabel: PLAN_TYPE_LABELS[doc.planType] || doc.planType,
    presenceTopLimit: doc.presenceTopLimit ?? null,
    durationType: doc.durationType,
    durationTypeLabel: DURATION_LABELS[doc.durationType] || doc.durationType,
    durationDays: Number(doc.durationDays),
    amount: Number(doc.amount) || 0,
    price: Number(doc.amount) || 0,
    startDate: doc.startDate ?? null,
    expiryDate: doc.expiryDate ?? null,
    purchaseDate: doc.purchaseDate ?? null,
    cityId: doc.cityId,
    subDistrictId: doc.subDistrictId,
    cityName: doc.cityName || "",
    subDistrictName: doc.subDistrictName || "",
    bannerImage: doc.bannerImage ? toAbsoluteUploadUrl(doc.bannerImage, baseUrl) : null,
    targetType: doc.targetType || null,
    targetProductId: doc.targetProductId || null,
    productId: doc.productId || null,
    paymentId: doc.paymentId || doc.razorpayPaymentId || null,
    paymentStatus: doc.paymentStatus,
    approvalStatus: doc.approvalStatus,
    status: runtimeStatus,
    rejectionReason: doc.rejectionReason || null,
    createdAt: doc.createdAt ?? null,
  };
}

function toPurchaseHistoryItem(doc) {
  if (!doc) return null;
  const runtimeStatus = resolveRuntimeStatus(doc);
  return {
    subscriptionId: doc._id,
    planId: doc.plan,
    planName: doc.planName || "",
    planType: doc.planType,
    durationType: doc.durationType,
    durationDays: Number(doc.durationDays),
    amount: Number(doc.amount) || 0,
    purchaseDate: doc.purchaseDate ?? doc.createdAt ?? null,
    startDate: doc.startDate ?? null,
    expiryDate: doc.expiryDate ?? null,
    paymentId: doc.paymentId || doc.razorpayPaymentId || null,
    paymentStatus: doc.paymentStatus,
    status: runtimeStatus,
  };
}

async function assertCityAndSubDistrict(cityId, subDistrictId) {
  assertObjectId(cityId, "Invalid city id");
  assertObjectId(subDistrictId, "Invalid sub-district id");
  const [city, subDistrict] = await Promise.all([
    City.findOne({ _id: cityId, status: "active" }).select("name").lean(),
    SubDistrict.findOne({ _id: subDistrictId, status: "active" }).select("name city").lean(),
  ]);
  if (!city) throw new AppError("City not found", 404);
  if (!subDistrict) throw new AppError("Sub-district not found", 404);
  if (String(subDistrict.city) !== String(cityId)) {
    throw new AppError("Sub-district does not belong to the selected city", 400);
  }
  return {
    cityId: city._id,
    subDistrictId: subDistrict._id,
    cityName: city.name,
    subDistrictName: subDistrict.name,
  };
}

async function assertVendorProduct(vendorId, productId) {
  assertObjectId(productId, "Invalid product id");
  const product = await Product.findOne({
    _id: productId,
    role: "Vendor",
    addedById: vendorId,
    status: "active",
    adminApproved: true,
  })
    .select("_id name")
    .lean();
  if (!product) {
    throw new AppError("Product not found, not yours, or not approved", 404);
  }
  return product;
}

async function listActivePromotionPlans({ planType, vendorType } = {}) {
  const filter = { status: "active" };
  if (planType) {
    const normalized = String(planType).trim().toLowerCase();
    if (!PromotionPlan.PLAN_TYPES.includes(normalized)) {
      throw new AppError("Invalid plan type filter", 400);
    }
    filter.planType = normalized;
  }
  if (vendorType) {
    const normalizedVendor = String(vendorType).trim().toLowerCase();
    if (normalizedVendor === "venue") {
      filter.vendorType = "venue";
      filter.planType = "banner";
    } else if (normalizedVendor === "ecom") {
      filter.$or = [{ vendorType: "ecom" }, { vendorType: { $exists: false } }, { vendorType: null }];
    }
  }
  const plans = await PromotionPlan.find(filter).sort({ planType: 1, createdAt: -1 }).lean();
  return plans.map(toPublicPromotionPlan).filter(Boolean);
}

/**
 * Create subscription + Razorpay order (or free → pending_review).
 */
async function assertOwnedVenue(venueVendorId, venueId) {
  assertObjectId(venueId, "Invalid venue id");
  const venue = await Venue.findOne({
    _id: venueId,
    role: "VenueVendor",
    addedById: venueVendorId,
    status: "active",
  })
    .select("_id name")
    .lean();
  if (!venue) {
    throw new AppError("Venue not found or not yours", 404);
  }
  return venue;
}

async function createPromotionCheckout({
  vendorId = null,
  venueVendorId = null,
  ownerType = "",
  planId,
  durationType,
  startDate,
  cityId,
  subDistrictId,
  bannerImage = null,
  targetType = null,
  targetProductId = null,
  targetVenueId = null,
  productId = null,
  baseUrl = "",
}) {
  const normalizedPlanId = String(planId ?? "").trim();
  if (!normalizedPlanId) {
    throw new AppError("planId is required", 400);
  }
  assertObjectId(normalizedPlanId, `Invalid plan id: "${normalizedPlanId}"`);
  const plan = await PromotionPlan.findById(normalizedPlanId).lean();
  if (!plan || plan.status !== "active") {
    throw new AppError("Promotion plan not found or inactive. Use an id from GET /api/vendor/promotion-plans", 404);
  }

  const resolvedOwnerType =
    String(ownerType || "").trim().toLowerCase() || (venueVendorId ? "venue" : "ecom");
  const planVendorType = plan.vendorType || "ecom";
  if (planVendorType !== resolvedOwnerType) {
    throw new AppError("This plan is not available for your account type", 400);
  }
  if (resolvedOwnerType === "venue") {
    if (!venueVendorId) throw new AppError("Venue vendor is required", 400);
    if (plan.planType !== "banner") {
      throw new AppError("Venue vendors can only buy Banner Promotion plans", 400);
    }
  } else if (!vendorId) {
    throw new AppError("Vendor is required", 400);
  }

  const duration = resolveDurationOption(plan, durationType);
  const start = parseStartDate(startDate);
  const expiry = addDaysUtc(start, duration.durationDays);
  const location = await assertCityAndSubDistrict(cityId, subDistrictId);

  let resolvedProductId = null;
  let resolvedTargetType = null;
  let resolvedTargetProductId = null;
  let resolvedTargetVenueId = null;
  let imagePath = bannerImage || null;

  if (plan.planType === "banner") {
    if (!imagePath) throw new AppError("Banner image is required", 400);
    if (resolvedOwnerType === "venue") {
      resolvedTargetType = "venue";
      if (targetVenueId) {
        const venue = await assertOwnedVenue(venueVendorId, targetVenueId);
        resolvedTargetVenueId = venue._id;
      }
    } else {
      resolvedTargetType = String(targetType || "shop").trim().toLowerCase();
      if (!["product", "shop"].includes(resolvedTargetType)) {
        throw new AppError("targetType must be product or shop", 400);
      }
      if (resolvedTargetType === "product") {
        const product = await assertVendorProduct(vendorId, targetProductId);
        resolvedTargetProductId = product._id;
      }
    }
  } else if (plan.planType === "product_presence_first") {
    const product = await assertVendorProduct(vendorId, productId);
    resolvedProductId = product._id;
  }

  const common = {
    ownerType: resolvedOwnerType,
    vendor: resolvedOwnerType === "ecom" ? vendorId : null,
    venueVendor: resolvedOwnerType === "venue" ? venueVendorId : null,
    plan: plan._id,
    planName: plan.name,
    planType: plan.planType,
    presenceTopLimit: plan.planType === "product_presence_first" ? plan.presenceTopLimit || 100 : null,
    durationType: duration.type,
    durationDays: duration.durationDays,
    amount: duration.price,
    startDate: start,
    expiryDate: expiry,
    ...location,
    bannerImage: imagePath,
    targetType: resolvedTargetType,
    targetProductId: resolvedTargetProductId,
    targetVenueId: resolvedTargetVenueId,
    productId: resolvedProductId,
    gateway: "razorpay",
  };

  if (duration.price <= 0) {
    const created = await PromotionSubscription.create({
      ...common,
      status: "pending_review",
      approvalStatus: "pending",
      paymentStatus: "free",
      purchaseDate: new Date(),
      paymentId: `FREE-${Date.now()}`,
    });
    return {
      requiresPayment: false,
      subscription: toPublicPromotionSubscription(created.toObject(), baseUrl),
    };
  }

  const pending = await PromotionSubscription.create({
    ...common,
    status: "pending_payment",
    approvalStatus: "pending",
    paymentStatus: "pending",
  });

  try {
    const order = await createRazorpayOrder({
      amountRupees: duration.price,
      receipt: `prm_${String(pending._id).slice(-10)}_${Date.now().toString().slice(-6)}`,
      notes: {
        subscriptionId: String(pending._id),
        planId: String(plan._id),
        planType: plan.planType,
        vendorId: String(vendorId || venueVendorId || ""),
        ownerType: resolvedOwnerType,
      },
    });
    pending.razorpayOrderId = order.orderId;
    await pending.save();

    return {
      requiresPayment: true,
      keyId: order.keyId,
      orderId: order.orderId,
      amount: order.amount,
      amountPaise: order.amountPaise,
      currency: order.currency,
      subscriptionId: pending._id,
      planId: plan._id,
      planName: plan.name,
      planType: plan.planType,
      durationType: duration.type,
      durationDays: duration.durationDays,
      startDate: start,
      expiryDate: expiry,
      description: `${PLAN_TYPE_LABELS[plan.planType] || plan.planType}: ${plan.name} (${DURATION_LABELS[duration.type]})`,
      subscription: toPublicPromotionSubscription(pending.toObject(), baseUrl),
    };
  } catch (error) {
    pending.status = "cancelled";
    pending.paymentStatus = "failed";
    await pending.save().catch(() => {});
    throw error;
  }
}

async function confirmPromotionPayment({
  vendorId = null,
  venueVendorId = null,
  subscriptionId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  baseUrl = "",
}) {
  const orderId = String(razorpayOrderId || "").trim();
  const paymentId = String(razorpayPaymentId || "").trim();
  const signature = String(razorpaySignature || "").trim();
  if (!orderId || !paymentId || !signature) {
    throw new AppError("razorpay_order_id, razorpay_payment_id and razorpay_signature are required", 400);
  }

  await verifyRazorpayCheckoutPayment({
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  const filter = {
    status: "pending_payment",
    razorpayOrderId: orderId,
  };
  if (venueVendorId) {
    filter.venueVendor = venueVendorId;
  } else {
    filter.vendor = vendorId;
  }
  if (subscriptionId) {
    assertObjectId(subscriptionId, "Invalid subscription id");
    filter._id = subscriptionId;
  }

  const pending = await PromotionSubscription.findOne(filter);
  if (!pending) throw new AppError("Pending promotion payment not found", 404);

  pending.status = "pending_review";
  pending.approvalStatus = "pending";
  pending.paymentStatus = "paid";
  pending.razorpayPaymentId = paymentId;
  pending.razorpaySignature = signature;
  pending.paymentId = paymentId;
  pending.purchaseDate = new Date();
  await pending.save();

  return toPublicPromotionSubscription(pending.toObject(), baseUrl);
}

function computeApprovedRuntimeStatus(startDate, expiryDate, now = new Date()) {
  const today = startOfUtcDay(now);
  const start = startOfUtcDay(startDate);
  const expiry = startOfUtcDay(expiryDate);
  if (expiry.getTime() <= today.getTime()) return "expired";
  if (start.getTime() > today.getTime()) return "scheduled";
  return "active";
}

async function approvePromotionRequest(requestId, adminId) {
  assertObjectId(requestId);
  const sub = await PromotionSubscription.findById(requestId);
  if (!sub) throw new AppError("Promotion request not found", 404);
  if (sub.status === "pending_payment") {
    throw new AppError("Payment is not completed yet", 400);
  }
  if (sub.approvalStatus === "approved") {
    throw new AppError("Already approved", 400);
  }
  if (!["pending_review", "rejected"].includes(sub.status) && sub.approvalStatus !== "pending") {
    // allow re-approve from rejected
  }

  const nextStatus = computeApprovedRuntimeStatus(sub.startDate, sub.expiryDate);
  sub.approvalStatus = "approved";
  sub.status = nextStatus;
  sub.rejectionReason = null;
  sub.reviewedAt = new Date();
  sub.reviewedBy = adminId || null;
  if (!sub.purchaseDate) sub.purchaseDate = new Date();
  await sub.save();
  return sub;
}

async function rejectPromotionRequest(requestId, adminId, reason = "") {
  assertObjectId(requestId);
  const sub = await PromotionSubscription.findById(requestId);
  if (!sub) throw new AppError("Promotion request not found", 404);
  if (sub.status === "pending_payment") {
    throw new AppError("Payment is not completed yet", 400);
  }

  sub.approvalStatus = "rejected";
  sub.status = "rejected";
  sub.rejectionReason = String(reason || "").trim() || "Rejected by admin";
  sub.reviewedAt = new Date();
  sub.reviewedBy = adminId || null;
  await sub.save();
  return sub;
}

function activeApprovedLocationFilter({ planType, cityId, subDistrictId }) {
  const today = startOfUtcDay(new Date());
  const filter = {
    planType,
    approvalStatus: "approved",
    status: { $in: ["active", "scheduled"] },
    startDate: { $lte: today },
    expiryDate: { $gt: today },
  };
  if (cityId) {
    assertObjectId(cityId, "Invalid city id");
    filter.cityId = cityId;
  }
  if (subDistrictId) {
    assertObjectId(subDistrictId, "Invalid sub-district id");
    filter.subDistrictId = subDistrictId;
  }
  return filter;
}

function ownerTypeFilter(ownerType) {
  const normalized = String(ownerType || "").trim().toLowerCase();
  if (normalized === "venue") return { ownerType: "venue" };
  if (normalized === "ecom") {
    return { $or: [{ ownerType: "ecom" }, { ownerType: { $exists: false } }, { ownerType: null }] };
  }
  return {};
}

async function listPromotionalBanners({ cityId, subDistrictId, ownerType = "", baseUrl = "" } = {}) {
  await expireDueSubscriptions({ planType: "banner" });
  const rows = await PromotionSubscription.find({
    ...activeApprovedLocationFilter({ planType: "banner", cityId, subDistrictId }),
    ...ownerTypeFilter(ownerType),
  })
    .sort({ updatedAt: -1 })
    .lean();

  const ecomIds = [
    ...new Set(rows.filter((r) => (r.ownerType || "ecom") !== "venue" && r.vendor).map((r) => String(r.vendor))),
  ];
  const venueIds = [
    ...new Set(rows.filter((r) => r.ownerType === "venue" && r.venueVendor).map((r) => String(r.venueVendor))),
  ];

  const [vendors, venueVendors] = await Promise.all([
    ecomIds.length
      ? Vendor.find({ ...activePublicVendorFilter(), _id: { $in: ecomIds } })
          .select("_id")
          .lean()
      : [],
    venueIds.length
      ? VenueVendor.find({
          _id: { $in: venueIds },
          status: "active",
          approvalStatus: "approved",
        })
          .select("_id")
          .lean()
      : [],
  ]);
  const ecomSet = new Set(vendors.map((v) => String(v._id)));
  const venueSet = new Set(venueVendors.map((v) => String(v._id)));

  return rows
    .filter((row) => {
      if (row.ownerType === "venue") return venueSet.has(String(row.venueVendor));
      return ecomSet.has(String(row.vendor));
    })
    .map((row) => ({
      _id: row._id,
      title: row.planName || "Sponsored",
      image: row.bannerImage ? toAbsoluteUploadUrl(row.bannerImage, baseUrl) : null,
      targetType: row.targetType || (row.ownerType === "venue" ? "venue" : "shop"),
      targetProductId: row.targetProductId || null,
      targetVenueId: row.targetVenueId || null,
      vendorId: row.vendor || null,
      venueVendorId: row.venueVendor || null,
      ownerType: row.ownerType || "ecom",
      cityId: row.cityId,
      cityName: row.cityName || "",
      subDistrictId: row.subDistrictId,
      startDate: row.startDate,
      expiryDate: row.expiryDate,
      source: row.ownerType === "venue" ? "venue_vendor_promotion" : "vendor_promotion",
    }))
    .filter((row) => row.image);
}

async function listPromotionalBannersForHome({ city = "", targetType = "ecom", baseUrl = "" } = {}) {
  const ownerType = String(targetType || "ecom").trim().toLowerCase() === "venue" ? "venue" : "ecom";
  const rows = await listPromotionalBanners({ ownerType, baseUrl });
  const cityNorm = String(city || "").trim().toLowerCase();
  const filtered = cityNorm
    ? rows.filter((row) => String(row.cityName || "").trim().toLowerCase() === cityNorm)
    : rows;

  return filtered.map((row) => ({
    _id: row._id,
    title: row.title,
    image: row.image,
    targetType: ownerType === "venue" ? "venue" : "ecom",
    related: ownerType === "venue" ? "venue" : "none",
    relatedId: row.targetVenueId || null,
    relatedEntity: null,
    mode: "city",
    categoryId: null,
    cities: [],
    startDate: row.startDate,
    endDate: row.expiryDate,
    source: row.source,
  }));
}

async function listVerifiedVendors({ cityId, subDistrictId, baseUrl = "" } = {}) {
  await expireDueSubscriptions({ planType: "get_verified" });
  const rows = await PromotionSubscription.find(
    activeApprovedLocationFilter({ planType: "get_verified", cityId, subDistrictId })
  )
    .sort({ updatedAt: -1 })
    .lean();

  const vendorIds = rows.map((r) => r.vendor);
  const vendors = await Vendor.find({
    ...activePublicVendorFilter(),
    _id: { $in: vendorIds },
  })
    .select("name businessName shopDescription shopLogo profileImage city state subDistrict")
    .lean();
  const byId = new Map(vendors.map((v) => [String(v._id), v]));
  const ratingByVendor = await getVendorRatingStatsMap(vendors.map((v) => v._id));

  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = String(row.vendor);
    if (seen.has(key)) continue;
    const vendor = byId.get(key);
    if (!vendor) continue;
    seen.add(key);
    const logo = vendor.shopLogo || vendor.profileImage || "";
    const ratingStats = ratingByVendor.get(key) || {};
    const overallRating = ratingStats.rating ?? 0;
    out.push({
      _id: vendor._id,
      vendorId: vendor._id,
      name: vendor.businessName || vendor.name || "",
      businessName: vendor.businessName || vendor.name || "",
      description: vendor.shopDescription || "",
      shopDescription: vendor.shopDescription || "",
      shopLogo: logo ? toAbsoluteUploadUrl(logo, baseUrl) : "",
      city: vendor.city || row.cityName || "",
      state: vendor.state || "",
      subDistrict: vendor.subDistrict || row.subDistrictName || "",
      overallRating,
      rating: overallRating || null,
      averageRating: overallRating,
      ratingCount: ratingStats.ratingCount ?? 0,
      isVerified: true,
      verifiedLabel: "Get Verified",
      planType: "get_verified",
      cityId: row.cityId,
      subDistrictId: row.subDistrictId,
    });
  }
  return out;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

async function listPromotedProducts({ cityId, subDistrictId, search = "", baseUrl = "" } = {}) {
  await expireDueSubscriptions({ planType: "product_presence_first" });
  const rows = await PromotionSubscription.find(
    activeApprovedLocationFilter({
      planType: "product_presence_first",
      cityId,
      subDistrictId,
    })
  )
    .sort({ updatedAt: -1 })
    .lean();
  if (!rows.length) return [];

  const productIds = rows.map((r) => r.productId).filter(Boolean);
  const productFilter = activePublicProductBaseFilter({
    role: "Vendor",
    _id: { $in: productIds },
  });
  if (search && String(search).trim()) {
    const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    productFilter.name = rx;
  }

  const products = await Product.find(productFilter).lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const vendorIds = [...new Set(products.map((p) => String(p.addedById)))];
  const vendors = await Vendor.find({
    ...activePublicVendorFilter(),
    _id: { $in: vendorIds },
  })
    .select("_id businessName shopLogo")
    .lean();
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

  // Group by top limit buckets — take up to each subscription's presenceTopLimit overall
  const maxLimit = Math.max(50, ...rows.map((r) => Number(r.presenceTopLimit) || 100));
  const cards = [];
  const usedProducts = new Set();

  for (const row of shuffleInPlace([...rows])) {
    const product = productById.get(String(row.productId));
    if (!product) continue;
    if (!vendorMap.has(String(product.addedById))) continue;
    if (usedProducts.has(String(product._id))) continue;
    usedProducts.add(String(product._id));

    const card = toPublicProductListCard(product, vendorMap.get(String(product.addedById)), baseUrl, {
      isWishlisted: false,
    });
    if (!card) continue;
    card.presenceBoosted = true;
    card.presenceLabel = "Product Presence First";
    card.planType = "product_presence_first";
    card.presenceTopLimit = row.presenceTopLimit || 100;
    card.promotionId = row._id;
    cards.push(card);
    if (cards.length >= maxLimit) break;
  }

  // Apply tighter top limit if all subs are top-50
  const allTop50 = rows.every((r) => Number(r.presenceTopLimit) === 50);
  if (allTop50) return cards.slice(0, 50);
  return cards.slice(0, 100);
}

async function buildPromotionDashboard() {
  await expireDueSubscriptions();
  const rows = await PromotionSubscription.find({
    status: { $ne: "pending_payment" },
  })
    .select("planType presenceTopLimit status approvalStatus amount paymentStatus purchaseDate createdAt")
    .lean();

  const today = startOfUtcDay(new Date());
  const weekAgo = new Date(today);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);

  function isPaid(row) {
    return row.paymentStatus === "paid" || row.paymentStatus === "free";
  }

  function sumRevenue(fromDate) {
    return rows
      .filter((r) => isPaid(r) && r.paymentStatus === "paid")
      .filter((r) => {
        const d = new Date(r.purchaseDate || r.createdAt);
        return d >= fromDate;
      })
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }

  const banner = {
    active: rows.filter((r) => r.planType === "banner" && r.status === "active").length,
    pending: rows.filter((r) => r.planType === "banner" && r.status === "pending_review").length,
    expired: rows.filter((r) => r.planType === "banner" && r.status === "expired").length,
  };
  const verified = {
    active: rows.filter((r) => r.planType === "get_verified" && r.status === "active").length,
    pending: rows.filter((r) => r.planType === "get_verified" && r.status === "pending_review").length,
    expired: rows.filter((r) => r.planType === "get_verified" && r.status === "expired").length,
  };
  const productTop50 = {
    active: rows.filter(
      (r) =>
        r.planType === "product_presence_first" &&
        Number(r.presenceTopLimit) === 50 &&
        r.status === "active"
    ).length,
  };
  const productTop100 = {
    active: rows.filter(
      (r) =>
        r.planType === "product_presence_first" &&
        Number(r.presenceTopLimit) !== 50 &&
        r.status === "active"
    ).length,
  };

  return {
    banner,
    getVerified: verified,
    productTop50,
    productTop100,
    revenue: {
      today: sumRevenue(today),
      weekly: sumRevenue(weekAgo),
      monthly: sumRevenue(monthAgo),
    },
  };
}

module.exports = {
  PLAN_TYPE_LABELS,
  DURATION_LABELS,
  startOfUtcDay,
  addDaysUtc,
  parseStartDate,
  resolveDurationOption,
  toPublicPromotionPlan,
  toPublicPromotionSubscription,
  toPurchaseHistoryItem,
  resolveRuntimeStatus,
  expireDueSubscriptions,
  listActivePromotionPlans,
  createPromotionCheckout,
  confirmPromotionPayment,
  approvePromotionRequest,
  rejectPromotionRequest,
  listPromotionalBanners,
  listPromotionalBannersForHome,
  listVerifiedVendors,
  listPromotedProducts,
  buildPromotionDashboard,
  assertCityAndSubDistrict,
  assertVendorProduct,
};
