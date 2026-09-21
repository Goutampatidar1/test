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
  expireDueSubscriptions,
} = require("../../utils/promotionEngine");

const UPLOAD_FOLDER = "banner";

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
    planType: "banner",
    vendorType: "venue",
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
      "planId is required. Send planId, durationType, startDate, cityId, subDistrictId and a banner image.",
      400
    );
  }

  try {
    const checkout = await createPromotionCheckout({
      venueVendorId: req.user._id,
      ownerType: "venue",
      planId,
      durationType: readBodyField(req.body, "durationType", "duration_type"),
      startDate: readBodyField(req.body, "startDate", "start_date"),
      cityId: readBodyField(req.body, "cityId", "city_id"),
      subDistrictId: readBodyField(req.body, "subDistrictId", "sub_district_id"),
      bannerImage,
      targetType: "venue",
      targetVenueId: readBodyField(req.body, "targetVenueId", "target_venue_id"),
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
    venueVendorId: req.user._id,
    ...payload,
    baseUrl: getPublicBaseUrl(req),
  });
  sendSuccess(res, "Payment confirmed. Promotion is pending admin review.", sub);
});

exports.listMyPromotions = asyncHandler(async (req, res) => {
  await expireDueSubscriptions({ venueVendor: req.user._id });
  const { page, limit, skip } = getPagination({ ...req.query, limit: req.query.limit || 50 });
  const filter = { venueVendor: req.user._id, status: { $ne: "pending_payment" } };
  if (req.query.status) filter.status = String(req.query.status).trim();

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
    venueVendor: req.user._id,
  }).lean();
  if (!row) throw new AppError("Promotion not found", 404);
  sendSuccess(res, "Promotion fetched", toPublicPromotionSubscription(row, getPublicBaseUrl(req)));
});
