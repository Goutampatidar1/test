const VendorPlan = require("../models/other/vendorPlan");
const VendorPlanSubscription = require("../models/other/vendorPlanSubscription");
const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");
const { deleteUploadFileByPublicUrl } = require("./deleteUploadFile");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { normalizeAmount } = require("./vendorWallet");
const { PLAN_TYPE_LABELS } = require("./vendorPlans");
const { createRazorpayOrder, verifyRazorpayCheckoutPayment } = require("./razorpay");

const ALLOWED_PLAN_TYPES = new Set(["banner", "get_verified", "product_presence_first"]);

function startOfUtcDay(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function isSubscriptionWindowActive(sub, now = new Date()) {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (sub.startDate && new Date(sub.startDate) > now) return false;
  if (sub.endDate && new Date(sub.endDate) < startOfUtcDay(now)) return false;
  return true;
}

function toPublicSubscription(doc, baseUrl = "") {
  if (!doc) return null;
  return {
    _id: doc._id,
    planId: doc.plan,
    planType: doc.planType,
    planTypeLabel: PLAN_TYPE_LABELS[doc.planType] || doc.planType,
    planName: doc.planName || "",
    price: Number(doc.price) || 0,
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
    status: doc.status,
    paidVia: doc.paidVia,
    gateway: doc.gateway || "razorpay",
    razorpayOrderId: doc.razorpayOrderId || null,
    razorpayPaymentId: doc.razorpayPaymentId || null,
    paidAt: doc.paidAt ?? null,
    presenceTopLimit: Number(doc.presenceTopLimit) || 100,
    presenceMode: doc.presenceMode || "random",
    featuredProductId: doc.featuredProductId || null,
    canUploadBanner: doc.planType === "banner" && doc.status === "active",
    canSetFeaturedProduct: doc.planType === "product_presence_first" && doc.status === "active",
    bannerImage: doc.bannerImage ? toAbsoluteUploadUrl(doc.bannerImage, baseUrl) : null,
    bannerTitle: doc.bannerTitle || "",
    hasBanner: Boolean(doc.bannerImage),
  };
}

async function expireOutOfWindowSubscriptions(ownerType, ownerId) {
  const now = new Date();
  const filter = {
    status: "active",
    endDate: { $lt: startOfUtcDay(now) },
  };
  if (ownerType) filter.ownerType = ownerType;
  if (ownerId) filter.owner = ownerId;
  await VendorPlanSubscription.updateMany(filter, { $set: { status: "expired" } });
}

async function findActiveSubscription(ownerType, ownerId, planType) {
  await expireOutOfWindowSubscriptions(ownerType, ownerId);
  const now = new Date();
  return VendorPlanSubscription.findOne({
    ownerType,
    owner: ownerId,
    planType,
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: startOfUtcDay(now) },
  }).lean();
}

async function findActiveBannerSubscription(ownerType, ownerId) {
  return findActiveSubscription(ownerType, ownerId, "banner");
}

async function getOwnerBannerSubscription(ownerType, ownerId, baseUrl = "") {
  const sub = await findActiveBannerSubscription(ownerType, ownerId);
  return toPublicSubscription(sub, baseUrl);
}

async function getOwnerSubscriptions(ownerType, ownerId, baseUrl = "") {
  await expireOutOfWindowSubscriptions(ownerType, ownerId);
  const now = new Date();
  const rows = await VendorPlanSubscription.find({
    ownerType,
    owner: ownerId,
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: startOfUtcDay(now) },
  })
    .sort({ createdAt: -1 })
    .lean();
  return rows.map((row) => toPublicSubscription(row, baseUrl)).filter(Boolean);
}

async function loadPlanForOwner(planId, ownerType) {
  assertObjectId(planId, "Invalid plan id");
  const normalizedOwner = String(ownerType || "").trim().toLowerCase();
  if (!["ecom", "venue"].includes(normalizedOwner)) {
    throw new AppError("Invalid owner type", 400);
  }

  const now = new Date();
  const plan = await VendorPlan.findById(planId).lean();
  if (!plan || plan.status !== "active") {
    throw new AppError("Plan not found or inactive", 404);
  }
  if (!ALLOWED_PLAN_TYPES.has(plan.planType)) {
    throw new AppError("Unsupported plan type", 400);
  }
  if (plan.vendorType !== "both" && plan.vendorType !== normalizedOwner) {
    throw new AppError("This plan is not available for your vendor type", 403);
  }
  if (
    startOfUtcDay(plan.startDate) > startOfUtcDay(now) ||
    new Date(plan.endDate) < startOfUtcDay(now)
  ) {
    throw new AppError("Plan is outside its active date range", 400);
  }

  return {
    plan,
    normalizedOwner,
    price: normalizeAmount(plan.price),
    planType: plan.planType,
  };
}

function planTypeLabel(planType) {
  return PLAN_TYPE_LABELS[planType] || planType;
}

/**
 * Start any vendor plan subscription (banner / get_verified / product_presence_first).
 * price = 0 → activate immediately
 * price > 0 → pending + Razorpay order
 */
async function createPlanCheckout({ ownerType, ownerId, planId, baseUrl = "" }) {
  const { plan, normalizedOwner, price, planType } = await loadPlanForOwner(planId, ownerType);

  const existing = await findActiveSubscription(normalizedOwner, ownerId, planType);
  if (existing) {
    throw new AppError(
      `You already have an active ${planTypeLabel(planType)} subscription.`,
      400
    );
  }

  await VendorPlanSubscription.updateMany(
    {
      ownerType: normalizedOwner,
      owner: ownerId,
      planType,
      status: "pending",
    },
    { $set: { status: "cancelled" } }
  );

  const presenceTopLimit = Number(plan.presenceTopLimit) || 100;
  const presenceMode = plan.presenceMode || "random";
  const common = {
    ownerType: normalizedOwner,
    owner: ownerId,
    plan: plan._id,
    planType,
    planName: plan.name,
    startDate: plan.startDate,
    endDate: plan.endDate,
    bannerImage: null,
    bannerTitle: "",
    presenceTopLimit,
    presenceMode,
    gateway: "razorpay",
  };

  if (price <= 0) {
    const created = await VendorPlanSubscription.create({
      ...common,
      price: 0,
      status: "active",
      paidVia: "free",
      paidAt: new Date(),
    });

    return {
      requiresPayment: false,
      subscription: toPublicSubscription(created.toObject(), baseUrl),
    };
  }

  const pending = await VendorPlanSubscription.create({
    ...common,
    price,
    status: "pending",
    paidVia: "razorpay",
  });

  try {
    const order = await createRazorpayOrder({
      amountRupees: price,
      receipt: `vp_${String(pending._id).slice(-10)}_${Date.now().toString().slice(-6)}`,
      notes: {
        subscriptionId: String(pending._id),
        planId: String(plan._id),
        ownerType: normalizedOwner,
        ownerId: String(ownerId),
        planType,
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
      planType,
      description: `${planTypeLabel(planType)}: ${plan.name}`,
      subscription: toPublicSubscription(pending.toObject(), baseUrl),
    };
  } catch (error) {
    pending.status = "cancelled";
    await pending.save().catch(() => {});
    throw error;
  }
}

async function confirmPlanPayment({
  ownerType,
  ownerId,
  subscriptionId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  baseUrl = "",
}) {
  const normalizedOwner = String(ownerType || "").trim().toLowerCase();
  if (!["ecom", "venue"].includes(normalizedOwner)) {
    throw new AppError("Invalid owner type", 400);
  }

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
    ownerType: normalizedOwner,
    owner: ownerId,
    status: "pending",
    razorpayOrderId: orderId,
  };
  if (subscriptionId) {
    assertObjectId(subscriptionId, "Invalid subscription id");
    filter._id = subscriptionId;
  }

  const pending = await VendorPlanSubscription.findOne(filter);
  if (!pending) {
    throw new AppError("Pending subscription payment not found", 404);
  }

  const existing = await findActiveSubscription(normalizedOwner, ownerId, pending.planType);
  if (existing) {
    pending.status = "cancelled";
    await pending.save();
    throw new AppError(
      `You already have an active ${planTypeLabel(pending.planType)} subscription`,
      400
    );
  }

  pending.status = "active";
  pending.paidVia = "razorpay";
  pending.gateway = "razorpay";
  pending.razorpayPaymentId = paymentId;
  pending.razorpaySignature = signature;
  pending.paidAt = new Date();
  await pending.save();

  return toPublicSubscription(pending.toObject(), baseUrl);
}

const createBannerPlanCheckout = createPlanCheckout;
const confirmBannerPlanPayment = confirmPlanPayment;

async function subscribeToBannerPlan(args) {
  const result = await createPlanCheckout(args);
  if (!result.requiresPayment) return result.subscription;
  return result;
}

async function uploadSubscriptionBanner({
  ownerType,
  ownerId,
  imagePath,
  title = "",
  baseUrl = "",
}) {
  if (!imagePath) {
    throw new AppError("Banner image is required", 400);
  }

  const sub = await VendorPlanSubscription.findOne({
    ownerType,
    owner: ownerId,
    planType: "banner",
    status: "active",
  });

  if (!sub || !isSubscriptionWindowActive(sub)) {
    deleteUploadFileByPublicUrl(imagePath);
    throw new AppError("Active Banner subscription required to upload a banner", 403);
  }

  const previous = sub.bannerImage;
  sub.bannerImage = imagePath;
  sub.bannerTitle = String(title ?? "").trim().slice(0, 120);

  try {
    await sub.save();
  } catch (error) {
    deleteUploadFileByPublicUrl(imagePath);
    throw error;
  }

  if (previous && previous !== imagePath) {
    deleteUploadFileByPublicUrl(previous);
  }

  return toPublicSubscription(sub.toObject(), baseUrl);
}

async function clearSubscriptionBanner({ ownerType, ownerId, baseUrl = "" }) {
  const sub = await VendorPlanSubscription.findOne({
    ownerType,
    owner: ownerId,
    planType: "banner",
    status: "active",
  });
  if (!sub || !isSubscriptionWindowActive(sub)) {
    throw new AppError("Active Banner subscription not found", 404);
  }
  if (sub.bannerImage) {
    deleteUploadFileByPublicUrl(sub.bannerImage);
    sub.bannerImage = null;
  }
  sub.bannerTitle = "";
  await sub.save();
  return toPublicSubscription(sub.toObject(), baseUrl);
}

/**
 * Product Presence First: set the single product shown on public home.
 * productId must belong to this ecom vendor and be publicly listable.
 */
async function setFeaturedPresenceProduct({ ownerId, productId, baseUrl = "" }) {
  assertObjectId(productId, "Invalid product id");

  const sub = await VendorPlanSubscription.findOne({
    ownerType: "ecom",
    owner: ownerId,
    planType: "product_presence_first",
    status: "active",
  });
  if (!sub || !isSubscriptionWindowActive(sub)) {
    throw new AppError("Active Product Presence First subscription required", 403);
  }

  const Product = require("../models/other/product");
  const product = await Product.findOne({
    _id: productId,
    role: "Vendor",
    addedById: ownerId,
    status: "active",
    adminApproved: true,
  })
    .select("_id")
    .lean();

  if (!product) {
    throw new AppError("Product not found, not yours, or not approved for listing", 404);
  }

  sub.featuredProductId = product._id;
  await sub.save();
  return toPublicSubscription(sub.toObject(), baseUrl);
}

/** Active subscribed vendor banners for carousels (one per vendor max). */
async function listActiveVendorSubscriptionBanners({ targetType = "ecom", baseUrl = "" } = {}) {
  const normalizedTarget = String(targetType ?? "ecom").trim().toLowerCase() === "venue" ? "venue" : "ecom";
  const now = new Date();
  await expireOutOfWindowSubscriptions(normalizedTarget);

  const rows = await VendorPlanSubscription.find({
    ownerType: normalizedTarget,
    planType: "banner",
    status: "active",
    bannerImage: { $nin: [null, ""] },
    startDate: { $lte: now },
    endDate: { $gte: startOfUtcDay(now) },
  })
    .sort({ updatedAt: -1 })
    .lean();

  return rows
    .map((doc) => ({
      _id: doc._id,
      title: doc.bannerTitle || doc.planName || "Sponsored",
      image: toAbsoluteUploadUrl(doc.bannerImage, baseUrl),
      targetType: normalizedTarget,
      related: "none",
      relatedId: null,
      relatedEntity: null,
      mode: "global",
      categoryId: null,
      cities: [],
      startDate: doc.startDate ?? null,
      endDate: doc.endDate ?? null,
      source: "vendor_subscription",
    }))
    .filter((item) => item.image);
}

async function listActiveSubscriptionsByPlanType({ ownerType = "ecom", planType } = {}) {
  const now = new Date();
  await expireOutOfWindowSubscriptions(ownerType);
  return VendorPlanSubscription.find({
    ownerType,
    planType,
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: startOfUtcDay(now) },
  })
    .sort({ paidAt: -1, updatedAt: -1 })
    .lean();
}

module.exports = {
  toPublicSubscription,
  findActiveSubscription,
  findActiveBannerSubscription,
  getOwnerBannerSubscription,
  getOwnerSubscriptions,
  createPlanCheckout,
  confirmPlanPayment,
  createBannerPlanCheckout,
  confirmBannerPlanPayment,
  subscribeToBannerPlan,
  uploadSubscriptionBanner,
  clearSubscriptionBanner,
  listActiveVendorSubscriptionBanners,
  listActiveSubscriptionsByPlanType,
  setFeaturedPresenceProduct,
  isSubscriptionWindowActive,
  startOfUtcDay,
};
