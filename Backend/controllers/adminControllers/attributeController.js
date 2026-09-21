const AttributeTitle = require("../../models/other/attributeTitle");
const AttributeValue = require("../../models/other/attributeValue");
const Category = require("../../models/other/category");
const SubCategory = require("../../models/other/subCategory");
const ChildCategory = require("../../models/other/childCategory");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");

const ALLOWED_STATUS = new Set(["active", "inactive"]);

const TITLE_POPULATE = [
  { path: "category", select: "name status mode" },
  { path: "subCategory", select: "name status mode category" },
  { path: "childCategory", select: "name status subCategory category" },
];
const VALUE_TITLE_POPULATE = {
  path: "attributeTitle",
  select: "title status category subCategory childCategory",
  populate: TITLE_POPULATE,
};

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertCategoryExists(categoryId) {
  assertObjectId(categoryId);
  const category = await Category.findById(categoryId).select("_id").lean();
  if (!category) throw new AppError("Category not found", 404);
}

async function assertSubCategoryForCategory(subCategoryId, categoryId) {
  assertObjectId(subCategoryId);
  const subCategory = await SubCategory.findById(subCategoryId).select("_id category").lean();
  if (!subCategory) throw new AppError("Sub-category not found", 404);
  if (String(subCategory.category) !== String(categoryId)) {
    throw new AppError("Sub-category does not belong to selected category", 400);
  }
}

function readChildCategoryFromBody(body) {
  if (!Object.prototype.hasOwnProperty.call(body, "childCategory")) return undefined;
  const raw = body.childCategory;
  if (raw === "" || raw === null || raw === undefined) return null;
  return normalizeRequired(raw);
}

async function assertChildCategoryForSubCategory(childCategoryId, categoryId, subCategoryId) {
  if (!childCategoryId) return null;
  assertObjectId(childCategoryId, "Invalid child category id");
  const childCategory = await ChildCategory.findOne({
    _id: childCategoryId,
    status: "active",
  }).lean();
  if (!childCategory) throw new AppError("Child category not found", 404);
  if (String(childCategory.subCategory) !== String(subCategoryId)) {
    throw new AppError("Child category does not belong to the selected sub-category", 400);
  }
  if (String(childCategory.category) !== String(categoryId)) {
    throw new AppError("Child category does not belong to the selected category", 400);
  }
  return childCategory;
}

async function assertTitleUnique(title, subCategoryId, childCategoryId = null, excludeId) {
  const rx = new RegExp(`^${escapeRegex(title)}$`, "i");
  const filter = { title: rx, subCategory: subCategoryId, childCategory: childCategoryId || null };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await AttributeTitle.findOne(filter).select("_id").lean();
  if (exists) {
    throw new AppError(
      childCategoryId
        ? "Attribute title already exists for this child category"
        : "Attribute title already exists for this sub-category",
      409
    );
  }
}

function normalizeColorCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new AppError("Invalid color code. Use hex format e.g. #FFFFFF", 400);
  }
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}

async function assertValueUnique(attributeTitleId, value, excludeId) {
  const rx = new RegExp(`^${escapeRegex(value)}$`, "i");
  const filter = { attributeTitle: attributeTitleId, value: rx };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await AttributeValue.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Attribute value already exists for this title", 409);
}

function applyChildCategoryToTitleFilter(filter, childCategory) {
  if (!childCategory) return;
  if (childCategory === "__sub__" || childCategory === "sub") {
    filter.childCategory = null;
    return;
  }
  assertObjectId(childCategory, "Invalid child category filter");
  filter.childCategory = childCategory;
}

function buildTitleFilter(query) {
  const { status, search, category, subCategory, childCategory } = query;
  const filter = {};

  if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (category) {
    assertObjectId(category);
    filter.category = category;
  }
  if (subCategory) {
    assertObjectId(subCategory);
    filter.subCategory = subCategory;
  }
  applyChildCategoryToTitleFilter(filter, childCategory);

  const searchOr = searchFilter(search, ["title"]);
  if (searchOr) Object.assign(filter, searchOr);

  return filter;
}

exports.listAttributeTitles = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildTitleFilter(req.query);

  const [attributeTitles, total] = await Promise.all([
    AttributeTitle.find(filter)
      .populate(TITLE_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AttributeTitle.countDocuments(filter),
  ]);

  res.json({
    attributeTitles,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getAttributeTitleById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const attributeTitle = await AttributeTitle.findById(req.params.id).populate(TITLE_POPULATE).lean();
  if (!attributeTitle) throw new AppError("Attribute title not found", 404);
  res.json({ attributeTitle });
});

exports.createAttributeTitle = asyncHandler(async (req, res) => {
  const title = normalizeRequired(req.body.title);
  const categoryId = normalizeRequired(req.body.category);
  const subCategoryId = normalizeRequired(req.body.subCategory);
  const status = normalizeRequired(req.body.status || "active");
  const childCategoryInput = readChildCategoryFromBody(req.body);

  if (!title) throw new AppError("Title is required", 400);
  if (!categoryId) throw new AppError("Category is required", 400);
  if (!subCategoryId) throw new AppError("Sub-category is required", 400);
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);

  await assertCategoryExists(categoryId);
  await assertSubCategoryForCategory(subCategoryId, categoryId);
  let childCategoryId = null;
  if (childCategoryInput) {
    await assertChildCategoryForSubCategory(childCategoryInput, categoryId, subCategoryId);
    childCategoryId = childCategoryInput;
  }
  await assertTitleUnique(title, subCategoryId, childCategoryId);
  const attributeTitle = await AttributeTitle.create({
    title,
    category: categoryId,
    subCategory: subCategoryId,
    childCategory: childCategoryId,
    status,
  });
  const fresh = await AttributeTitle.findById(attributeTitle._id).populate(TITLE_POPULATE).lean();
  res.status(201).json({ message: "Attribute title created", attributeTitle: fresh });
});

exports.updateAttributeTitle = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const attributeTitle = await AttributeTitle.findById(req.params.id);
  if (!attributeTitle) throw new AppError("Attribute title not found", 404);

  let nextCategoryId = String(attributeTitle.category);
  let nextSubCategoryId = String(attributeTitle.subCategory);
  let nextChildCategoryId = attributeTitle.childCategory ? String(attributeTitle.childCategory) : null;

  if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
    const categoryId = normalizeRequired(req.body.category);
    if (!categoryId) throw new AppError("Category cannot be empty", 400);
    await assertCategoryExists(categoryId);
    attributeTitle.category = categoryId;
    nextCategoryId = categoryId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "subCategory")) {
    const subCategoryId = normalizeRequired(req.body.subCategory);
    if (!subCategoryId) throw new AppError("Sub-category cannot be empty", 400);
    await assertSubCategoryForCategory(subCategoryId, nextCategoryId);
    attributeTitle.subCategory = subCategoryId;
    nextSubCategoryId = subCategoryId;
    if (!Object.prototype.hasOwnProperty.call(req.body, "childCategory")) {
      nextChildCategoryId = null;
      attributeTitle.childCategory = null;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body, "category") &&
    !Object.prototype.hasOwnProperty.call(req.body, "subCategory")
  ) {
    await assertSubCategoryForCategory(nextSubCategoryId, nextCategoryId);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "childCategory")) {
    const childCategoryInput = readChildCategoryFromBody(req.body);
    if (!childCategoryInput) {
      nextChildCategoryId = null;
      attributeTitle.childCategory = null;
    } else {
      await assertChildCategoryForSubCategory(childCategoryInput, nextCategoryId, nextSubCategoryId);
      nextChildCategoryId = childCategoryInput;
      attributeTitle.childCategory = childCategoryInput;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    const title = normalizeRequired(req.body.title);
    if (!title) throw new AppError("Title cannot be empty", 400);
    await assertTitleUnique(title, nextSubCategoryId, nextChildCategoryId, attributeTitle._id);
    attributeTitle.title = title;
  } else if (
    Object.prototype.hasOwnProperty.call(req.body, "subCategory") ||
    Object.prototype.hasOwnProperty.call(req.body, "childCategory")
  ) {
    await assertTitleUnique(attributeTitle.title, nextSubCategoryId, nextChildCategoryId, attributeTitle._id);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    attributeTitle.status = status;
  }

  await attributeTitle.save();
  const fresh = await AttributeTitle.findById(attributeTitle._id).populate(TITLE_POPULATE).lean();
  res.json({ message: "Attribute title updated", attributeTitle: fresh });
});

exports.deleteAttributeTitle = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const attributeTitle = await AttributeTitle.findById(req.params.id);
  if (!attributeTitle) throw new AppError("Attribute title not found", 404);

  const linkedValues = await AttributeValue.countDocuments({ attributeTitle: attributeTitle._id });
  if (linkedValues > 0) {
    throw new AppError("Cannot delete attribute title with existing values", 409);
  }

  await AttributeTitle.findByIdAndDelete(attributeTitle._id);
  res.json({ message: "Attribute title deleted" });
});

exports.listAttributeValues = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, attributeTitle, category, subCategory, childCategory } = req.query;

  const filter = {};
  if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (attributeTitle) {
    assertObjectId(attributeTitle);
    filter.attributeTitle = attributeTitle;
  }
  if (category || subCategory || childCategory) {
    const titleFilter = {};
    if (category) {
      assertObjectId(category);
      titleFilter.category = category;
    }
    if (subCategory) {
      assertObjectId(subCategory);
      titleFilter.subCategory = subCategory;
    }
    applyChildCategoryToTitleFilter(titleFilter, childCategory);
    const titleIds = await AttributeTitle.find(titleFilter).select("_id").lean();
    filter.attributeTitle = { $in: titleIds.map((row) => row._id) };
    if (!titleIds.length) {
      return res.json({
        attributeValues: [],
        pagination: { page, limit, total: 0, pages: 1 },
      });
    }
  }

  const searchOr = searchFilter(search, ["value"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [attributeValues, total] = await Promise.all([
    AttributeValue.find(filter)
      .populate(VALUE_TITLE_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AttributeValue.countDocuments(filter),
  ]);

  res.json({
    attributeValues,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getAttributeValueById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const attributeValue = await AttributeValue.findById(req.params.id).populate(VALUE_TITLE_POPULATE).lean();
  if (!attributeValue) throw new AppError("Attribute value not found", 404);
  res.json({ attributeValue });
});

exports.createAttributeValue = asyncHandler(async (req, res) => {
  const attributeTitleId = normalizeRequired(req.body.attributeTitle);
  const value = normalizeRequired(req.body.value);
  const status = normalizeRequired(req.body.status || "active");
  const colorCode = normalizeColorCode(req.body.colorCode);

  if (!attributeTitleId || !value) {
    throw new AppError("Attribute title and value are required", 400);
  }
  assertObjectId(attributeTitleId);
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);

  const titleExists = await AttributeTitle.findById(attributeTitleId).select("_id title").lean();
  if (!titleExists) throw new AppError("Attribute title not found", 404);

  await assertValueUnique(attributeTitleId, value);
  const attributeValue = await AttributeValue.create({
    attributeTitle: attributeTitleId,
    value,
    colorCode: /color/i.test(titleExists.title || "") ? colorCode : "",
    status,
  });

  const fresh = await AttributeValue.findById(attributeValue._id).populate(VALUE_TITLE_POPULATE).lean();

  res.status(201).json({ message: "Attribute value created", attributeValue: fresh });
});

exports.updateAttributeValue = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const attributeValue = await AttributeValue.findById(req.params.id);
  if (!attributeValue) throw new AppError("Attribute value not found", 404);

  let nextAttributeTitleId = String(attributeValue.attributeTitle);

  if (Object.prototype.hasOwnProperty.call(req.body, "attributeTitle")) {
    const attributeTitleId = normalizeRequired(req.body.attributeTitle);
    if (!attributeTitleId) throw new AppError("Attribute title cannot be empty", 400);
    assertObjectId(attributeTitleId);

    const titleExists = await AttributeTitle.findById(attributeTitleId).select("_id").lean();
    if (!titleExists) throw new AppError("Attribute title not found", 404);

    attributeValue.attributeTitle = attributeTitleId;
    nextAttributeTitleId = attributeTitleId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "value")) {
    const value = normalizeRequired(req.body.value);
    if (!value) throw new AppError("Value cannot be empty", 400);
    await assertValueUnique(nextAttributeTitleId, value, attributeValue._id);
    attributeValue.value = value;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "colorCode")) {
    const titleDoc = await AttributeTitle.findById(nextAttributeTitleId).select("title").lean();
    const colorCode = normalizeColorCode(req.body.colorCode);
    attributeValue.colorCode = /color/i.test(titleDoc?.title || "") ? colorCode : "";
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    attributeValue.status = status;
  }

  await attributeValue.save();
  const fresh = await AttributeValue.findById(attributeValue._id).populate(VALUE_TITLE_POPULATE).lean();
  res.json({ message: "Attribute value updated", attributeValue: fresh });
});

exports.deleteAttributeValue = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const attributeValue = await AttributeValue.findById(req.params.id);
  if (!attributeValue) throw new AppError("Attribute value not found", 404);

  await AttributeValue.findByIdAndDelete(attributeValue._id);
  res.json({ message: "Attribute value deleted" });
});
