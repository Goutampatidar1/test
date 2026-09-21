const Promotion = require("../../models/other/promotion");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const ALLOWED_DISCOUNT_TYPES = new Set(["percentage", "flat"]);
const UPLOAD_FOLDER = "promotion";

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function parseDateOrThrow(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }
  return date;
}

function parseNumberOrThrow(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new AppError(`${fieldName} must be a valid number`, 400);
  }
  return number;
}

function parseOptionalNumberOrUndefined(value, fieldName) {
  const normalized = normalizeOptional(value);
  if (!normalized) return undefined;
  return parseNumberOrThrow(normalized, fieldName);
}

function assertDateRange(startDate, endDate) {
  if (startDate > endDate) {
    throw new AppError("Start date cannot be after end date", 400);
  }
}

function validateDiscountFields(discountType, discountValue, maximumDiscountAmount) {
  if (discountValue < 0) {
    throw new AppError("Discount value cannot be negative", 400);
  }
  if (discountType === "percentage" && discountValue > 100) {
    throw new AppError("Percentage discount cannot be greater than 100", 400);
  }
  if (maximumDiscountAmount !== undefined && maximumDiscountAmount < 0) {
    throw new AppError("Maximum discount amount cannot be negative", 400);
  }
}

exports.listPromotions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, discountType } = req.query;

  const filter = {};
  if (status) {
    const normalizedStatus = String(status).trim();
    if (!ALLOWED_STATUS.has(normalizedStatus)) throw new AppError("Invalid status filter", 400);
    filter.status = normalizedStatus;
  }
  if (discountType) {
    const normalizedDiscountType = String(discountType).trim();
    if (!ALLOWED_DISCOUNT_TYPES.has(normalizedDiscountType)) throw new AppError("Invalid discount type filter", 400);
    filter.discountType = normalizedDiscountType;
  }

  const searchOr = searchFilter(search, ["promoCode", "displayMessage", "discountType"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [promotions, total] = await Promise.all([
    Promotion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Promotion.countDocuments(filter),
  ]);

  res.json({
    promotions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getPromotionById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const promotion = await Promotion.findById(req.params.id).lean();
  if (!promotion) throw new AppError("Promotion not found", 404);
  res.json({ promotion });
});

exports.createPromotion = asyncHandler(async (req, res) => {
  const promoCode = normalizeRequired(req.body.promoCode).toUpperCase();
  const displayMessage = normalizeRequired(req.body.displayMessage);
  const imageFromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const image = normalizeRequired(imageFromFile ?? req.body.image);
  const status = normalizeOptional(req.body.status) || "active";
  const discountType = normalizeRequired(req.body.discountType).toLowerCase();

  if (!promoCode || !displayMessage || !image || !discountType) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Promo code, display message, image, and discount type are required", 400);
  }
  if (!ALLOWED_STATUS.has(status)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid status", 400);
  }
  if (!ALLOWED_DISCOUNT_TYPES.has(discountType)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid discount type", 400);
  }

  try {
    const startDate = parseDateOrThrow(req.body.startDate, "Start date");
    const endDate = parseDateOrThrow(req.body.endDate, "End date");
    assertDateRange(startDate, endDate);

    const discountValue = parseNumberOrThrow(req.body.discountValue, "Discount value");
    const minimumOrderAmount = parseOptionalNumberOrUndefined(req.body.minimumOrderAmount, "Minimum order amount") ?? 0;
    const maximumDiscountAmount = parseOptionalNumberOrUndefined(req.body.maximumDiscountAmount, "Maximum discount amount");
    const totalUsageLimit = parseNumberOrThrow(req.body.totalUsageLimit, "Total usage limit");

    if (!Number.isInteger(totalUsageLimit) || totalUsageLimit < 1) {
      throw new AppError("Total usage limit must be an integer greater than 0", 400);
    }
    if (minimumOrderAmount < 0) {
      throw new AppError("Minimum order amount cannot be negative", 400);
    }

    validateDiscountFields(discountType, discountValue, maximumDiscountAmount);

    const existing = await Promotion.findOne({ promoCode });
    if (existing) {
      throw new AppError("Promo code already exists", 409);
    }

    const promotion = await Promotion.create({
      promoCode,
      displayMessage,
      image,
      startDate,
      endDate,
      discountType,
      discountValue,
      minimumOrderAmount,
      maximumDiscountAmount,
      totalUsageLimit,
      status,
    });

    res.status(201).json({ message: "Promotion created", promotion });
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

exports.updatePromotion = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) throw new AppError("Promotion not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "promoCode")) {
    const promoCode = normalizeRequired(req.body.promoCode).toUpperCase();
    if (!promoCode) throw new AppError("Promo code cannot be empty", 400);
    const duplicate = await Promotion.findOne({ promoCode, _id: { $ne: promotion._id } }).lean();
    if (duplicate) throw new AppError("Promo code already exists", 409);
    promotion.promoCode = promoCode;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "displayMessage")) {
    const displayMessage = normalizeRequired(req.body.displayMessage);
    if (!displayMessage) throw new AppError("Display message cannot be empty", 400);
    promotion.displayMessage = displayMessage;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
    const image = normalizeRequired(req.body.image);
    if (!image) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Image cannot be empty", 400);
    }
    promotion.image = image;
  }

  if (req.file) {
    const uploadedImage = publicUploadPathFromFile(req, UPLOAD_FOLDER);
    deleteUploadFileByPublicUrl(promotion.image);
    promotion.image = uploadedImage;
  }

  let nextStartDate = promotion.startDate;
  let nextEndDate = promotion.endDate;

  if (Object.prototype.hasOwnProperty.call(req.body, "startDate")) {
    const startDateRaw = normalizeOptional(req.body.startDate);
    nextStartDate = startDateRaw ? parseDateOrThrow(startDateRaw, "Start date") : undefined;
    promotion.startDate = nextStartDate;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "endDate")) {
    const endDateRaw = normalizeOptional(req.body.endDate);
    nextEndDate = endDateRaw ? parseDateOrThrow(endDateRaw, "End date") : undefined;
    promotion.endDate = nextEndDate;
  }

  if (nextStartDate && nextEndDate) {
    assertDateRange(nextStartDate, nextEndDate);
  }

  const effectiveDiscountType = Object.prototype.hasOwnProperty.call(req.body, "discountType")
    ? normalizeRequired(req.body.discountType).toLowerCase()
    : promotion.discountType;

  if (Object.prototype.hasOwnProperty.call(req.body, "discountType")) {
    if (!effectiveDiscountType) throw new AppError("Discount type cannot be empty", 400);
    if (!ALLOWED_DISCOUNT_TYPES.has(effectiveDiscountType)) throw new AppError("Invalid discount type", 400);
    promotion.discountType = effectiveDiscountType;
  }

  const effectiveDiscountValue = Object.prototype.hasOwnProperty.call(req.body, "discountValue")
    ? parseNumberOrThrow(req.body.discountValue, "Discount value")
    : promotion.discountValue;

  if (Object.prototype.hasOwnProperty.call(req.body, "discountValue")) {
    promotion.discountValue = effectiveDiscountValue;
  }

  const effectiveMaximumDiscountAmount = Object.prototype.hasOwnProperty.call(req.body, "maximumDiscountAmount")
    ? parseOptionalNumberOrUndefined(req.body.maximumDiscountAmount, "Maximum discount amount")
    : promotion.maximumDiscountAmount;

  if (Object.prototype.hasOwnProperty.call(req.body, "maximumDiscountAmount")) {
    promotion.maximumDiscountAmount = effectiveMaximumDiscountAmount;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "minimumOrderAmount")) {
    const minimumOrderAmount = parseOptionalNumberOrUndefined(req.body.minimumOrderAmount, "Minimum order amount") ?? 0;
    if (minimumOrderAmount < 0) throw new AppError("Minimum order amount cannot be negative", 400);
    promotion.minimumOrderAmount = minimumOrderAmount;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "totalUsageLimit")) {
    const totalUsageLimit = parseNumberOrThrow(req.body.totalUsageLimit, "Total usage limit");
    if (!Number.isInteger(totalUsageLimit) || totalUsageLimit < 1) {
      throw new AppError("Total usage limit must be an integer greater than 0", 400);
    }
    promotion.totalUsageLimit = totalUsageLimit;
  }

  validateDiscountFields(effectiveDiscountType, effectiveDiscountValue, effectiveMaximumDiscountAmount);

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid status", 400);
    }
    promotion.status = status;
  }

  await promotion.save();
  res.json({ message: "Promotion updated", promotion });
});

exports.deletePromotion = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) throw new AppError("Promotion not found", 404);

  deleteUploadFileByPublicUrl(promotion.image);
  await Promotion.findByIdAndDelete(promotion._id);
  res.json({ message: "Promotion deleted" });
});
