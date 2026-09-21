const AttributeTitle = require("../../models/other/attributeTitle");
const AttributeValue = require("../../models/other/attributeValue");
const SubCategory = require("../../models/other/subCategory");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const {
  findOrCreateAttributeTitle,
  findOrCreateAttributeValue,
  isColorTitle,
} = require("../../utils/attributeEnsure");
const {
  toVendorAttributeTitle,
  toVendorAttributeValue,
  toVendorAttributeCatalog,
} = require("../../utils/mobilePresenters");

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

async function assertActiveEcomSubCategory(subCategoryId) {
  assertObjectId(subCategoryId, "Invalid sub-category id");
  const subCategory = await SubCategory.findOne({
    _id: subCategoryId,
    status: "active",
    mode: "ecom",
  })
    .populate("category", "name mode status")
    .lean();

  if (!subCategory) {
    throw new AppError("Sub-category not found", 404);
  }

  const category = subCategory.category;
  if (!category || category.status !== "active" || category.mode !== "ecom") {
    throw new AppError("Category is not available for this sub-category", 404);
  }

  return subCategory;
}

/** Full attribute catalog for a sub-category (SIZE TYPE + values, color + values) */
exports.getAttributeCatalog = asyncHandler(async (req, res) => {
  const subCategoryId = req.params.subCategoryId || req.query.subCategory;
  if (!subCategoryId) {
    throw new AppError("subCategory is required", 400);
  }

  await assertActiveEcomSubCategory(subCategoryId);

  const titles = await AttributeTitle.find({
    subCategory: subCategoryId,
    status: "active",
  })
    .sort({ title: 1 })
    .lean();

  const titleIds = titles.map((t) => t._id);
  const values = titleIds.length
    ? await AttributeValue.find({
        attributeTitle: { $in: titleIds },
        status: "active",
      })
        .sort({ value: 1 })
        .lean()
    : [];

  const valuesByTitle = new Map();
  for (const row of values) {
    const key = String(row.attributeTitle);
    if (!valuesByTitle.has(key)) valuesByTitle.set(key, []);
    valuesByTitle.get(key).push(row);
  }

  const catalog = toVendorAttributeCatalog(titles, valuesByTitle);
  sendSuccess(res, "Attribute catalog fetched", catalog);
});

/** List attribute titles (SIZE TYPE list) for a sub-category */
exports.listAttributeTitles = asyncHandler(async (req, res) => {
  const subCategoryId = req.query.subCategory;
  const kind = normalizeRequired(req.query.kind || "all").toLowerCase();

  if (!subCategoryId) {
    throw new AppError("subCategory is required", 400);
  }

  await assertActiveEcomSubCategory(subCategoryId);

  const titles = await AttributeTitle.find({
    subCategory: subCategoryId,
    status: "active",
  })
    .sort({ title: 1 })
    .lean();

  const filtered = titles.filter((row) => {
    if (kind === "color") return isColorTitle(row.title);
    if (kind === "size") return !isColorTitle(row.title);
    return true;
  });

  const items = filtered.map(toVendorAttributeTitle).filter(Boolean);
  sendSuccess(res, "Attribute titles fetched", items);
});

/** List values for one attribute title (SELECT SIZE / COLOR options) */
exports.listAttributeValues = asyncHandler(async (req, res) => {
  const attributeTitleId = req.query.attributeTitle;
  if (!attributeTitleId) {
    throw new AppError("attributeTitle is required", 400);
  }
  assertObjectId(attributeTitleId, "Invalid attributeTitle id");

  const title = await AttributeTitle.findOne({
    _id: attributeTitleId,
    status: "active",
  })
    .select("_id")
    .lean();
  if (!title) {
    throw new AppError("Attribute title not found", 404);
  }

  const values = await AttributeValue.find({
    attributeTitle: attributeTitleId,
    status: "active",
  })
    .sort({ value: 1 })
    .lean();

  const items = values.map((row) => toVendorAttributeValue(row, title)).filter(Boolean);
  sendSuccess(res, "Attribute values fetched", items);
});

/** Create attribute title if missing (e.g. new Shoe Size / T-Shirt Size) */
exports.ensureAttributeTitle = asyncHandler(async (req, res) => {
  const subCategoryId = normalizeRequired(req.body.subCategory || req.body.subCategoryId);
  const categoryId = normalizeRequired(req.body.category || req.body.categoryId);
  const title = normalizeRequired(req.body.title);

  if (!subCategoryId || !title) {
    throw new AppError("subCategory and title are required", 400);
  }

  const subCategory = await assertActiveEcomSubCategory(subCategoryId);
  const resolvedCategoryId = categoryId || String(subCategory.category._id || subCategory.category);

  if (categoryId && String(subCategory.category._id || subCategory.category) !== String(categoryId)) {
    throw new AppError("Sub-category does not belong to the given category", 400);
  }

  const { attributeTitle, created } = await findOrCreateAttributeTitle({
    categoryId: resolvedCategoryId,
    subCategoryId,
    title,
  });

  sendSuccess(
    res,
    created ? "Attribute title created" : "Attribute title already exists",
    toVendorAttributeTitle(attributeTitle),
    created ? 201 : 200
  );
});

/** Create attribute value if missing (e.g. size 10, color white) */
exports.ensureAttributeValue = asyncHandler(async (req, res) => {
  const attributeTitleId = normalizeRequired(req.body.attributeTitle || req.body.attributeTitleId);
  const value = normalizeRequired(req.body.value);
  const colorCode = req.body.colorCode;

  if (!attributeTitleId || !value) {
    throw new AppError("attributeTitle and value are required", 400);
  }
  assertObjectId(attributeTitleId, "Invalid attributeTitle id");

  const title = await AttributeTitle.findOne({
    _id: attributeTitleId,
    status: "active",
  })
    .select("_id title")
    .lean();
  if (!title) {
    throw new AppError("Attribute title not found", 404);
  }

  const { attributeValue, created } = await findOrCreateAttributeValue({
    attributeTitleId,
    value,
    colorCode,
  });

  sendSuccess(
    res,
    created ? "Attribute value created" : "Attribute value already exists",
    toVendorAttributeValue(attributeValue, title),
    created ? 201 : 200
  );
});

/**
 * Ensure title + value in one call (vendor add variant flow).
 * Body: category, subCategory, title, value, colorCode (optional)
 */
exports.ensureAttribute = asyncHandler(async (req, res) => {
  const subCategoryId = normalizeRequired(req.body.subCategory || req.body.subCategoryId);
  const categoryId = normalizeRequired(req.body.category || req.body.categoryId);
  const title = normalizeRequired(req.body.title);
  const value = normalizeRequired(req.body.value);
  const colorCode = req.body.colorCode;

  if (!subCategoryId || !title) {
    throw new AppError("subCategory and title are required", 400);
  }

  const subCategory = await assertActiveEcomSubCategory(subCategoryId);
  const resolvedCategoryId = categoryId || String(subCategory.category._id || subCategory.category);

  if (categoryId && String(subCategory.category._id || subCategory.category) !== String(categoryId)) {
    throw new AppError("Sub-category does not belong to the given category", 400);
  }

  const { attributeTitle, created: titleCreated } = await findOrCreateAttributeTitle({
    categoryId: resolvedCategoryId,
    subCategoryId,
    title,
  });

  let attributeValue = null;
  let valueCreated = false;
  if (value) {
    const result = await findOrCreateAttributeValue({
      attributeTitleId: attributeTitle._id,
      value,
      colorCode,
    });
    attributeValue = result.attributeValue;
    valueCreated = result.created;
  }

  sendSuccess(
    res,
    titleCreated || valueCreated ? "Attribute ensured" : "Attribute already exists",
    {
      attributeTitle: toVendorAttributeTitle(attributeTitle),
      attributeValue: attributeValue
        ? toVendorAttributeValue(attributeValue, attributeTitle)
        : null,
      titleCreated,
      valueCreated,
    },
    titleCreated || valueCreated ? 201 : 200
  );
});
