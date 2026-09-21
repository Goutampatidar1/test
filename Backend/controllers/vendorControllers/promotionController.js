const PromotionSubscription = require("../../models/other/promotionSubscription");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const {
  listActivePromotionPlans,
  createPromotionCheckout,
  confirmPromotionPayment,
  toPublicPromotionSubscription,
  toPurchaseHistoryItem,
  expireDueSubscriptions,
} = require("../../utils/promotionEngine");

const UPLOAD_FOLDER = "banner";

/** Multipart fields sometimes arrive as arrays or quoted strings from mobile clients. */
function readBodyField(body = {}, ...keys) {
  for (const key of keys) {
    let value = body?.[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value = value[0];
    value = String(value).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    if (value) return value;
  }
  return "";
}

function readConfirmBody(body = {}) {
  return {
    subscriptionId: readBodyField(body, "subscriptionId", "subscription_id"),
    razorpayOrderId: readBodyField(body, "razorpay_order_id", "razorpayOrderId"),
    razorpayPaymentId: readBodyField(
      body,
      "razorpay_payment_id",
      "razorpayPaymentId",
      "paymentId"
    ),
    razorpaySignature: readBodyField(body, "razorpay_signature", "razorpaySignature"),
  };
}

exports.listPlans = asyncHandler(async (req, res) => {
  const plans = await listActivePromotionPlans({
    planType: req.query.planType,
    vendorType: "ecom",
  });
  sendSuccess(res, "Promotion plans fetched", plans);
});

exports.subscribe = asyncHandler(async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const imageFromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const bannerImage =
    imageFromFile || readBodyField(req.body, "bannerImage", "banner_image") || null;

  const planId = readBodyField(req.body, "planId", "plan_id");
  if (!planId) {
    if (imageFromFile) deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError(
      "planId is required. Send multipart/form-data fields: planId, durationType, startDate, cityId, subDistrictId (and file for banner).",
      400
    );
  }

  try {
    const checkout = await createPromotionCheckout({
      vendorId: req.user._id,
      planId,
      durationType: readBodyField(req.body, "durationType", "duration_type"),
      startDate: readBodyField(req.body, "startDate", "start_date"),
      cityId: readBodyField(req.body, "cityId", "city_id"),
      subDistrictId: readBodyField(req.body, "subDistrictId", "sub_district_id"),
      bannerImage,
      targetType: readBodyField(req.body, "targetType", "target_type") || "shop",
      targetProductId: readBodyField(req.body, "targetProductId", "target_product_id"),
      productId: readBodyField(req.body, "productId", "product_id"),
      baseUrl,
    });

    sendSuccess(
      res,
      checkout.requiresPayment
        ? "Complete Razorpay payment to submit promotion for review"
        : "Promotion submitted for admin review",
      checkout,
      checkout.requiresPayment ? 200 : 201
    );
  } catch (error) {
    if (imageFromFile) deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

exports.confirmPayment = asyncHandler(async (req, res) => {
  const payload = readConfirmBody(req.body);
  const sub = await confirmPromotionPayment({
    vendorId: req.user._id,
    ...payload,
    baseUrl: getPublicBaseUrl(req),
  });
  sendSuccess(res, "Payment confirmed. Promotion is pending admin review.", sub);
});

exports.listMyPromotions = asyncHandler(async (req, res) => {
  await expireDueSubscriptions({ vendor: req.user._id });
  const { page, limit, skip } = getPagination({ ...req.query, limit: req.query.limit || 50 });
  const filter = { vendor: req.user._id, status: { $ne: "pending_payment" } };
  if (req.query.status) filter.status = String(req.query.status).trim();
  if (req.query.planType) filter.planType = String(req.query.planType).trim();

  const [rows, total] = await Promise.all([
    PromotionSubscription.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PromotionSubscription.countDocuments(filter),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const items = rows.map((row) => toPublicPromotionSubscription(row, baseUrl));
  return res.status(200).json({
    status: items.length > 0,
    message: "Promotions fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      hasMore: page * limit < total,
    },
  });
});

exports.getMyPromotionById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const row = await PromotionSubscription.findOne({
    _id: req.params.id,
    vendor: req.user._id,
  }).lean();
  if (!row) throw new AppError("Promotion not found", 404);
  sendSuccess(res, "Promotion fetched", toPublicPromotionSubscription(row, getPublicBaseUrl(req)));
});

exports.purchaseHistory = asyncHandler(async (req, res) => {
  await expireDueSubscriptions({ vendor: req.user._id });
  const { page, limit, skip } = getPagination({ ...req.query, limit: req.query.limit || 20 });
  const filter = {
    vendor: req.user._id,
    status: { $nin: ["pending_payment", "cancelled"] },
    paymentStatus: { $in: ["paid", "free"] },
  };

  const [rows, total] = await Promise.all([
    PromotionSubscription.find(filter).sort({ purchaseDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    PromotionSubscription.countDocuments(filter),
  ]);

  const items = rows.map(toPurchaseHistoryItem).filter(Boolean);
  return res.status(200).json({
    status: items.length > 0,
    message: "Plan purchase history fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      hasMore: page * limit < total,
    },
  });
});
