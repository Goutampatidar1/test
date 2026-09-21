const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const AppError = require("../../utils/AppError");
const { listActiveVendorPlans } = require("../../utils/vendorPlans");
const {
  getOwnerBannerSubscription,
  getOwnerSubscriptions,
  createPlanCheckout,
  confirmPlanPayment,
  uploadSubscriptionBanner,
  clearSubscriptionBanner,
  setFeaturedPresenceProduct,
} = require("../../utils/vendorPlanSubscription");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");

const UPLOAD_FOLDER = "banner";

function requestBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function readRazorpayConfirmBody(body = {}) {
  return {
    subscriptionId: body.subscriptionId || body.subscription_id || "",
    razorpayOrderId: body.razorpay_order_id || body.razorpayOrderId || "",
    razorpayPaymentId: body.razorpay_payment_id || body.razorpayPaymentId || "",
    razorpaySignature: body.razorpay_signature || body.razorpaySignature || "",
  };
}

/**
 * Ecom vendor — all active plans (ecom + both).
 * Query: availableOnly=true → only plans within start/end date.
 */
exports.listPlans = asyncHandler(async (req, res) => {
  const availableOnly =
    String(req.query?.availableOnly ?? req.query?.available ?? "").trim().toLowerCase() === "true" ||
    String(req.query?.availableOnly ?? "").trim() === "1";
  const plans = await listActiveVendorPlans({ vendorType: "ecom", availableOnly });
  sendSuccess(res, "Plans fetched", plans);
});

/** Current active Banner subscription (if any) */
exports.getBannerSubscription = asyncHandler(async (req, res) => {
  const sub = await getOwnerBannerSubscription("ecom", req.user._id, requestBaseUrl(req));
  sendSuccess(res, sub ? "Banner subscription fetched" : "No active Banner subscription", sub ? [sub] : []);
});

/** All active plan subscriptions for this vendor */
exports.getSubscriptions = asyncHandler(async (req, res) => {
  const rows = await getOwnerSubscriptions("ecom", req.user._id, requestBaseUrl(req));
  sendSuccess(res, "Subscriptions fetched", rows);
});

/**
 * Start plan subscription (banner / get_verified / product_presence_first).
 * Free → activate immediately. Paid → Razorpay checkout (requiresPayment: true).
 */
exports.subscribeBannerPlan = asyncHandler(async (req, res) => {
  const planId = req.params.planId || req.body.planId;
  const checkout = await createPlanCheckout({
    ownerType: "ecom",
    ownerId: req.user._id,
    planId,
    baseUrl: requestBaseUrl(req),
  });
  sendSuccess(
    res,
    checkout.requiresPayment ? "Complete Razorpay payment to activate plan" : "Plan subscribed",
    checkout,
    checkout.requiresPayment ? 200 : 201
  );
});

/** Confirm Razorpay payment and activate subscription */
exports.confirmBannerPlanPayment = asyncHandler(async (req, res) => {
  const payload = readRazorpayConfirmBody(req.body);
  const sub = await confirmPlanPayment({
    ownerType: "ecom",
    ownerId: req.user._id,
    ...payload,
    baseUrl: requestBaseUrl(req),
  });
  sendSuccess(res, "Plan payment confirmed", sub);
});

/** Upload / replace the single subscription banner image */
exports.uploadBanner = asyncHandler(async (req, res) => {
  const imagePath = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  if (!imagePath) {
    throw new AppError("Banner image file is required (field: file)", 400);
  }
  const sub = await uploadSubscriptionBanner({
    ownerType: "ecom",
    ownerId: req.user._id,
    imagePath,
    title: req.body?.title,
    baseUrl: requestBaseUrl(req),
  });
  sendSuccess(res, "Banner uploaded. Only one banner is allowed; re-upload replaces it.", sub);
});

/** Remove subscription banner image (keeps plan active) */
exports.clearBanner = asyncHandler(async (req, res) => {
  const sub = await clearSubscriptionBanner({
    ownerType: "ecom",
    ownerId: req.user._id,
    baseUrl: requestBaseUrl(req),
  });
  sendSuccess(res, "Banner removed", sub);
});

/**
 * Product Presence First — set the single product shown on public home.
 * Body: { productId }
 */
exports.setFeaturedProduct = asyncHandler(async (req, res) => {
  const productId = req.body?.productId || req.body?.product_id || req.params.productId;
  const sub = await setFeaturedPresenceProduct({
    ownerId: req.user._id,
    productId,
    baseUrl: requestBaseUrl(req),
  });
  sendSuccess(res, "Featured product set for Product Presence First listing", sub);
});
