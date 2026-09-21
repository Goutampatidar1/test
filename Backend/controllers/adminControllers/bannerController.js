const Banner = require("../../models/other/banner");
const Category = require("../../models/other/category");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");

const { normalizeTargetType, normalizeRelatedType } = require("../../utils/bannerSpecs");
const Product = require("../../models/other/product");
const Vendor = require("../../models/entity/vendor");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const ALLOWED_MODE = new Set(["global", "city"]);
const UPLOAD_FOLDER = "banner";

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function normalizeCities(input) {
  if (input === undefined || input === null) return undefined;
  const values = Array.isArray(input) ? input : String(input).split(",");
  return values
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function parseDateOrThrow(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }
  return date;
}

function assertDateRange(startDate, endDate) {
  if (startDate > endDate) {
    throw new AppError("Start date cannot be after end date", 400);
  }
}

function hasCategoryInBody(body) {
  return (
    Object.prototype.hasOwnProperty.call(body, "category") ||
    Object.prototype.hasOwnProperty.call(body, "categoryId")
  );
}

function readCategoryFromBody(body) {
  if (!hasCategoryInBody(body)) return undefined;
  const raw = body.category ?? body.categoryId;
  if (raw === "" || raw === null || raw === undefined) return null;
  return String(raw).trim();
}

async function assertOptionalCategoryForTarget(categoryId, targetType) {
  if (!categoryId) return null;
  assertObjectId(categoryId, "Invalid category id");
  const categoryMode = targetType === "venue" ? "venue" : "ecom";
  const category = await Category.findOne({
    _id: categoryId,
    status: "active",
    mode: categoryMode,
  })
    .select("_id")
    .lean();
  if (!category) throw new AppError("Category not found", 404);
  return categoryId;
}

async function assertOptionalRelatedId(related, relatedId) {
  if (!relatedId) return null;
  assertObjectId(relatedId, "Invalid related id");
  if (related === "product") {
    const product = await Product.findById(relatedId).select("_id").lean();
    if (!product) throw new AppError("Product not found", 404);
    return relatedId;
  }
  if (related === "vendor") {
    const vendor = await Vendor.findById(relatedId).select("_id").lean();
    if (!vendor) throw new AppError("Vendor not found", 404);
    return relatedId;
  }
  return null;
}

function supportsRelated(targetType) {
  return targetType === "user" || targetType === "ecom";
}

function resolveRelatedFields(targetType, body) {
  if (!supportsRelated(targetType)) {
    return { related: "none", relatedIdRaw: undefined };
  }
  const relatedRaw = Object.prototype.hasOwnProperty.call(body, "related")
    ? normalizeRelatedType(body.related)
    : "none";
  if (!relatedRaw) throw new AppError("Invalid related type", 400);
  return {
    related: relatedRaw,
    relatedIdRaw: Object.prototype.hasOwnProperty.call(body, "relatedId")
      ? normalizeOptional(body.relatedId)
      : undefined,
  };
}

/** @deprecated use assertOptionalCategoryForTarget */
async function assertOptionalEcomCategory(categoryId) {
  return assertOptionalCategoryForTarget(categoryId, "ecom");
}

exports.listBanners = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, mode, city, targetType } = req.query;

  const filter = {};
  if (targetType && String(targetType).trim()) {
    const normalizedTarget = normalizeTargetType(String(targetType).trim());
    if (!normalizedTarget) throw new AppError("Invalid target type filter", 400);
    filter.targetType = normalizedTarget;
  }
  if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (mode && String(mode).trim()) {
    const normalizedMode = String(mode).trim();
    if (!ALLOWED_MODE.has(normalizedMode)) throw new AppError("Invalid mode filter", 400);
    filter.mode = normalizedMode;
  }
  if (city && String(city).trim()) {
    filter.cities = String(city).trim();
  }

  const searchOr = searchFilter(search, ["title", "mode", "cities"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [banners, total] = await Promise.all([
    Banner.find(filter)
      .populate("category", "name mode status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Banner.countDocuments(filter),
  ]);

  res.json({
    banners,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getBannerById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const banner = await Banner.findById(req.params.id).populate("category", "name mode status").lean();
  if (!banner) throw new AppError("Banner not found", 404);
  res.json({ banner });
});

exports.createBanner = asyncHandler(async (req, res) => {
  const targetTypeRaw = normalizeOptional(req.body.targetType) || "ecom";
  const targetType = normalizeTargetType(targetTypeRaw);
  if (!targetType) {
    deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
    throw new AppError("Invalid banner target type. Use ecom, venue, or user.", 400);
  }
  const mode = normalizeRequired(req.body.mode);
  const title = normalizeRequired(req.body.title);
  const imageFromFile = publicUploadPathFromFile(req, UPLOAD_FOLDER);
  const image = normalizeRequired(imageFromFile ?? req.body.image);
  const status = normalizeOptional(req.body.status) || "active";
  const startDateRaw = normalizeOptional(req.body.startDate);
  const endDateRaw = normalizeOptional(req.body.endDate);
  const cities = normalizeCities(req.body.cities) || [];
  const categoryInput = readCategoryFromBody(req.body);

  if (!mode || !title || !image) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Mode, title, and image are required", 400);
  }
  if (!ALLOWED_MODE.has(mode)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid mode", 400);
  }
  if (!ALLOWED_STATUS.has(status)) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Invalid status", 400);
  }
  if (mode === "city" && cities.length === 0) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("At least one city is required for city mode", 400);
  }

  try {
    const startDate = startDateRaw ? parseDateOrThrow(startDateRaw, "Start date") : undefined;
    const endDate = endDateRaw ? parseDateOrThrow(endDateRaw, "End date") : undefined;
    if (startDate && endDate) {
      assertDateRange(startDate, endDate);
    }

    const relatedFields = resolveRelatedFields(targetType, req.body);
    const related = relatedFields.related;
    let categoryId = null;
    let relatedId = null;

    if (supportsRelated(targetType)) {
      if (related === "category") {
        categoryId = categoryInput === undefined ? null : await assertOptionalCategoryForTarget(categoryInput, targetType);
        if (!categoryId) {
          deleteUploadFileByPublicUrl(imageFromFile);
          throw new AppError("Please select a category for this banner", 400);
        }
      } else if (related === "product" || related === "vendor") {
        relatedId = await assertOptionalRelatedId(related, relatedFields.relatedIdRaw);
        if (!relatedId) {
          deleteUploadFileByPublicUrl(imageFromFile);
          throw new AppError(`Please select a ${related} for this banner`, 400);
        }
      }
    } else if (categoryInput !== undefined) {
      categoryId = await assertOptionalCategoryForTarget(categoryInput, targetType);
    }

    const banner = await Banner.create({
      targetType,
      mode,
      title,
      image,
      related,
      category: categoryId || null,
      relatedId: relatedId || null,
      startDate,
      endDate,
      cities,
      status,
    });

    const fresh = await Banner.findById(banner._id).populate("category", "name mode status").lean();
    res.status(201).json({ message: "Banner created", banner: fresh });
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

exports.updateBanner = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw new AppError("Banner not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "targetType")) {
    const targetType = normalizeTargetType(req.body.targetType);
    if (!targetType) throw new AppError("Invalid target type", 400);
    banner.targetType = targetType;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "mode")) {
    const mode = normalizeRequired(req.body.mode);
    if (!mode) throw new AppError("Mode cannot be empty", 400);
    if (!ALLOWED_MODE.has(mode)) throw new AppError("Invalid mode", 400);
    banner.mode = mode;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    const title = normalizeRequired(req.body.title);
    if (!title) throw new AppError("Title cannot be empty", 400);
    banner.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
    const image = normalizeRequired(req.body.image);
    if (!image) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Image cannot be empty", 400);
    }
    banner.image = image;
  }

  if (req.file) {
    const uploadedImage = publicUploadPathFromFile(req, UPLOAD_FOLDER);
    deleteUploadFileByPublicUrl(banner.image);
    banner.image = uploadedImage;
  }

  let nextStartDate = banner.startDate;
  let nextEndDate = banner.endDate;

  if (Object.prototype.hasOwnProperty.call(req.body, "startDate")) {
    const startDateRaw = normalizeOptional(req.body.startDate);
    nextStartDate = startDateRaw ? parseDateOrThrow(startDateRaw, "Start date") : undefined;
    banner.startDate = nextStartDate;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "endDate")) {
    const endDateRaw = normalizeOptional(req.body.endDate);
    nextEndDate = endDateRaw ? parseDateOrThrow(endDateRaw, "End date") : undefined;
    banner.endDate = nextEndDate;
  }

  if (nextStartDate && nextEndDate) {
    assertDateRange(nextStartDate, nextEndDate);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "cities")) {
    banner.cities = normalizeCities(req.body.cities) || [];
  }

  if (banner.mode === "city" && (!Array.isArray(banner.cities) || banner.cities.length === 0)) {
    deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
    throw new AppError("At least one city is required for city mode", 400);
  }

  if (hasCategoryInBody(req.body) && !supportsRelated(banner.targetType)) {
    const categoryInput = readCategoryFromBody(req.body);
    banner.category =
      categoryInput === null ? null : await assertOptionalCategoryForTarget(categoryInput, banner.targetType);
  }

  if (
    supportsRelated(banner.targetType) &&
    hasCategoryInBody(req.body) &&
    !Object.prototype.hasOwnProperty.call(req.body, "related") &&
    (banner.related || "none") === "category"
  ) {
    const categoryInput = readCategoryFromBody(req.body);
    banner.category =
      categoryInput === null ? null : await assertOptionalCategoryForTarget(categoryInput, banner.targetType);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "related") || Object.prototype.hasOwnProperty.call(req.body, "relatedId")) {
    if (!supportsRelated(banner.targetType)) {
      banner.related = "none";
      banner.relatedId = null;
    } else {
      const related = Object.prototype.hasOwnProperty.call(req.body, "related")
        ? normalizeRelatedType(req.body.related)
        : banner.related || "none";
      if (!related) throw new AppError("Invalid related type", 400);
      banner.related = related;

      if (related === "none") {
        banner.category = null;
        banner.relatedId = null;
      } else if (related === "category") {
        banner.relatedId = null;
        if (hasCategoryInBody(req.body)) {
          const categoryInput = readCategoryFromBody(req.body);
          banner.category =
            categoryInput === null ? null : await assertOptionalCategoryForTarget(categoryInput, banner.targetType);
        }
      } else {
        banner.category = null;
        const relatedIdRaw = Object.prototype.hasOwnProperty.call(req.body, "relatedId")
          ? normalizeOptional(req.body.relatedId)
          : banner.relatedId
            ? String(banner.relatedId)
            : "";
        const relatedId = await assertOptionalRelatedId(related, relatedIdRaw);
        if (!relatedId) throw new AppError(`Please select a ${related} for this banner`, 400);
        banner.relatedId = relatedId;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "targetType") && !supportsRelated(banner.targetType)) {
    banner.related = "none";
    banner.relatedId = null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) {
      deleteUploadFileByPublicUrl(publicUploadPathFromFile(req, UPLOAD_FOLDER));
      throw new AppError("Invalid status", 400);
    }
    banner.status = status;
  }

  await banner.save();
  const fresh = await Banner.findById(banner._id).populate("category", "name mode status").lean();
  res.json({ message: "Banner updated", banner: fresh });
});

exports.deleteBanner = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw new AppError("Banner not found", 404);

  deleteUploadFileByPublicUrl(banner.image);
  await Banner.findByIdAndDelete(banner._id);
  res.json({ message: "Banner deleted" });
});
