const Category = require("../../models/other/category");
const SubCategory = require("../../models/other/subCategory");
const ChildCategory = require("../../models/other/childCategory");
const Product = require("../../models/other/product");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { toVendorCategory, toVendorSubCategory, toVendorChildCategory } = require("../../utils/mobilePresenters");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const { publicUploadPathFromFile } = require("../../utils/publicUploadPath");
const { resolveVendorApprovalRequired } = require("../../utils/vendorApproval");

const CATEGORY_UPLOAD_FOLDER = "category";
const SUB_CATEGORY_UPLOAD_FOLDER = "sub-category";
const CHILD_CATEGORY_UPLOAD_FOLDER = "child-category";

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertCategoryNameUnique(name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = {
    name: exactNameRx,
    mode: "ecom",
    status: { $in: ["active", "pending"] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await Category.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Category name already exists", 409);
}

function categoryImageFromReq(req) {
  const fromSingle = publicUploadPathFromFile(req, CATEGORY_UPLOAD_FOLDER);
  if (fromSingle) return fromSingle;

  const fieldNames = ["file", "image", "categoryImage"];
  for (const field of fieldNames) {
    const f = req.files?.[field]?.[0];
    if (f) return `/uploads/${CATEGORY_UPLOAD_FOLDER}/${f.filename}`;
  }
  if (Array.isArray(req.files)) {
    const f = req.files.find((file) => fieldNames.includes(file.fieldname));
    if (f) return `/uploads/${CATEGORY_UPLOAD_FOLDER}/${f.filename}`;
  }
  return undefined;
}

async function productCountByVendorCategoryIds(vendorId, categoryIds) {
  if (!vendorId || !Array.isArray(categoryIds) || categoryIds.length === 0) {
    return new Map();
  }

  const rows = await Product.aggregate([
    {
      $match: {
        role: "Vendor",
        addedById: reqObjectId(vendorId),
        category: { $in: categoryIds.map((id) => reqObjectId(id)) },
      },
    },
    {
      $group: {
        _id: "$category",
        productCount: { $sum: 1 },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), Number(row.productCount) || 0]));
}

function reqObjectId(value) {
  return typeof value === "string" ? new Category.db.base.Types.ObjectId(value) : value;
}

async function assertSubCategoryNameUnique(categoryId, name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = {
    category: categoryId,
    name: exactNameRx,
    status: { $in: ["active", "pending"] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await SubCategory.findOne(filter).select("_id").lean();
  if (exists) {
    throw new AppError("Sub-category name already exists in this category", 409);
  }
}

function subCategoryImageFromReq(req) {
  const fromSingle = publicUploadPathFromFile(req, SUB_CATEGORY_UPLOAD_FOLDER);
  if (fromSingle) return fromSingle;

  const fieldNames = ["file", "image", "subCategoryImage"];
  for (const field of fieldNames) {
    const f = req.files?.[field]?.[0];
    if (f) return `/uploads/${SUB_CATEGORY_UPLOAD_FOLDER}/${f.filename}`;
  }
  if (Array.isArray(req.files)) {
    const f = req.files.find((file) => fieldNames.includes(file.fieldname));
    if (f) return `/uploads/${SUB_CATEGORY_UPLOAD_FOLDER}/${f.filename}`;
  }
  return undefined;
}

async function assertChildCategoryNameUnique(subCategoryId, name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = {
    subCategory: subCategoryId,
    name: exactNameRx,
    status: { $in: ["active", "pending"] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await ChildCategory.findOne(filter).select("_id").lean();
  if (exists) {
    throw new AppError("Child category name already exists in this sub-category", 409);
  }
}

function normalizeUploadFieldName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function uploadPathFromMulterFile(folder, file) {
  if (!file?.filename) return undefined;
  return `/uploads/${folder}/${file.filename}`;
}

function childCategoryImageFromReq(req) {
  const fromSingle = publicUploadPathFromFile(req, CHILD_CATEGORY_UPLOAD_FOLDER);
  if (fromSingle) return fromSingle;

  const preferredNames = new Set(["file", "image", "childcategoryimage"]);

  if (req.files && typeof req.files === "object" && !Array.isArray(req.files)) {
    for (const [key, arr] of Object.entries(req.files)) {
      if (preferredNames.has(normalizeUploadFieldName(key)) && arr?.[0]) {
        return uploadPathFromMulterFile(CHILD_CATEGORY_UPLOAD_FOLDER, arr[0]);
      }
    }
  }

  if (Array.isArray(req.files) && req.files.length) {
    const preferred = req.files.find((file) =>
      preferredNames.has(normalizeUploadFieldName(file.fieldname))
    );
    const imageFile =
      preferred ||
      req.files.find((file) => String(file.mimetype || "").startsWith("image/")) ||
      req.files[0];
    return uploadPathFromMulterFile(CHILD_CATEGORY_UPLOAD_FOLDER, imageFile);
  }

  return undefined;
}

/** Active e-commerce categories for vendor register / shop category dropdown */
exports.listCategories = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { page, limit, skip } = getPagination(paginationQuery);
  const { search } = req.query;

  const filter = { status: "active", mode: "ecom" };
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const categories = await Category.find(filter)
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items = categories
    .map((doc) => toVendorCategory(doc, baseUrl))
    .filter(Boolean);

  sendSuccess(res, "Categories fetched", items);
});

/** Vendor's own categories (includes pending / rejected) */
exports.listMyCategories = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search, status } = req.query;

  const filter = {
    mode: "ecom",
    role: "Vendor",
    addedById: req.user._id,
  };
  if (status) {
    filter.status = String(status).trim();
  }
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const categories = await Category.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items = categories
    .map((doc) => toVendorCategory(doc, baseUrl))
    .filter(Boolean);

  sendSuccess(res, "Your categories fetched", items);
});

/** Vendor app home — categories with this vendor's product counts */
exports.listMyCategoryProductCounts = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "20",
  };
  const { page, limit, skip } = getPagination(paginationQuery);
  const { search, status } = req.query;

  const productRows = await Product.aggregate([
    {
      $match: {
        role: "Vendor",
        addedById: reqObjectId(req.user._id),
      },
    },
    {
      $group: {
        _id: "$category",
        productCount: { $sum: 1 },
      },
    },
    {
      $sort: {
        productCount: -1,
        _id: 1,
      },
    },
  ]);

  const countMap = new Map(
    productRows.map((row) => [String(row._id), Number(row.productCount) || 0])
  );
  const categoryIds = productRows.map((row) => row._id).filter(Boolean);

  let categoryFilter = {
    _id: { $in: categoryIds },
    mode: "ecom",
  };
  if (status) {
    categoryFilter.status = String(status).trim();
  }
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) {
    categoryFilter = { ...categoryFilter, ...searchOr };
  }

  const total = categoryIds.length === 0 ? 0 : await Category.countDocuments(categoryFilter);
  const categories = categoryIds.length === 0
    ? []
    : await Category.find(categoryFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

  const baseUrl = getPublicBaseUrl(req);

  const items = categories
    .map((doc) => {
      const category = toVendorCategory(doc, baseUrl);
      if (!category) return null;
      return {
        ...category,
        productCount: countMap.get(String(doc._id)) ?? 0,
      };
    })
    .filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Category product counts fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/** Create e-commerce category (same MongoDB shape as admin; role Vendor + addedById) */
exports.createCategory = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const imageFromFile = categoryImageFromReq(req);
  const image = normalizeOptional(imageFromFile ?? req.body.image);

  if (!name) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Category name is required", 400);
  }
  if (!image) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Category image is required", 400);
  }

  try {
    await assertCategoryNameUnique(name);
    const { approvalRequired, catalogStatus } = await resolveVendorApprovalRequired();

    const category = await Category.create({
      name,
      image,
      mode: "ecom",
      role: "Vendor",
      addedById: req.user._id,
      status: catalogStatus,
    });

    const baseUrl = getPublicBaseUrl(req);
    sendSuccess(
      res,
      approvalRequired
        ? "Category submitted for admin approval"
        : "Category created successfully",
      toVendorCategory(category, baseUrl),
      201
    );
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

/** Active e-commerce sub-categories for one category */
exports.listSubCategories = asyncHandler(async (req, res) => {
  const categoryId = req.params.categoryId || req.query.category;
  if (!categoryId) {
    throw new AppError("category is required", 400);
  }
  assertObjectId(categoryId, "Invalid category id");

  const category = await Category.findOne({
    _id: categoryId,
    status: "active",
    mode: "ecom",
  })
    .select("_id name mode")
    .lean();
  if (!category) {
    throw new AppError("Category not found", 404);
  }

  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search } = req.query;

  const filter = {
    status: "active",
    mode: "ecom",
    category: categoryId,
  };
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const subCategories = await SubCategory.find(filter)
    .populate("category", "name mode")
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items = subCategories
    .map((doc) => toVendorSubCategory(doc, baseUrl))
    .filter(Boolean);

  sendSuccess(res, "Sub-categories fetched", items);
});

/** Create e-commerce sub-category (pending admin approval) */
exports.createSubCategory = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const categoryId = normalizeRequired(req.body.category);
  const imageFromFile = subCategoryImageFromReq(req);
  const image = normalizeOptional(imageFromFile ?? req.body.image);

  if (!name) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Sub-category name is required", 400);
  }
  if (!categoryId) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Category is required", 400);
  }
  if (!image) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Sub-category image is required", 400);
  }

  assertObjectId(categoryId, "Invalid category id");
  const parent = await Category.findOne({
    _id: categoryId,
    status: "active",
    mode: "ecom",
  })
    .select("_id name mode")
    .lean();
  if (!parent) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Category not found or not approved yet", 404);
  }

  try {
    await assertSubCategoryNameUnique(categoryId, name);
    const { approvalRequired, catalogStatus } = await resolveVendorApprovalRequired();

    const subCategory = await SubCategory.create({
      name,
      image,
      category: categoryId,
      mode: "ecom",
      role: "Vendor",
      addedById: req.user._id,
      status: catalogStatus,
    });

    const populated = await SubCategory.findById(subCategory._id)
      .populate("category", "name mode status")
      .lean();

    const baseUrl = getPublicBaseUrl(req);
    sendSuccess(
      res,
      approvalRequired
        ? "Sub-category submitted for admin approval"
        : "Sub-category created successfully",
      toVendorSubCategory(populated, baseUrl),
      201
    );
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

/** Vendor's own sub-categories (includes pending / rejected) */
exports.listMySubCategories = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search, status, category } = req.query;

  const filter = {
    mode: "ecom",
    role: "Vendor",
    addedById: req.user._id,
  };
  if (status) filter.status = String(status).trim();
  if (category) {
    assertObjectId(category, "Invalid category id");
    filter.category = category;
  }
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const subCategories = await SubCategory.find(filter)
    .populate("category", "name mode status")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items = subCategories
    .map((doc) => toVendorSubCategory(doc, baseUrl))
    .filter(Boolean);

  sendSuccess(res, "Your sub-categories fetched", items);
});

/** Active e-commerce child categories (filter by subCategory and/or category) */
exports.listChildCategories = asyncHandler(async (req, res) => {
  const subCategoryId =
    req.params.subCategoryId ||
    req.query.subCategory ||
    req.query.subCategoryId ||
    req.query.subCategories ||
    req.query.sub_category ||
    req.query["sub-categories"];
  const categoryId =
    req.params.categoryId || req.query.category || req.query.categoryId;

  if (subCategoryId) {
    assertObjectId(subCategoryId, "Invalid subCategory id");
    const subCategoryFilter = {
      _id: subCategoryId,
      status: "active",
      mode: "ecom",
    };
    if (categoryId) {
      assertObjectId(categoryId, "Invalid category id");
      subCategoryFilter.category = categoryId;
    }

    const subCategory = await SubCategory.findOne(subCategoryFilter)
      .select("_id name mode category")
      .lean();
    if (!subCategory) {
      throw new AppError("Sub-category not found", 404);
    }
  }

  if (categoryId) {
    assertObjectId(categoryId, "Invalid category id");
    const category = await Category.findOne({
      _id: categoryId,
      status: "active",
      mode: "ecom",
    })
      .select("_id")
      .lean();
    if (!category) {
      throw new AppError("Category not found", 404);
    }
  }

  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search } = req.query;

  const filter = {
    status: "active",
    mode: "ecom",
  };
  if (subCategoryId) filter.subCategory = subCategoryId;
  if (categoryId) filter.category = categoryId;

  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const childCategories = await ChildCategory.find(filter)
    .populate("category", "name mode")
    .populate("subCategory", "name mode")
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items = childCategories
    .map((doc) => toVendorChildCategory(doc, baseUrl))
    .filter(Boolean);

  sendSuccess(res, "Child categories fetched", items);
});

/** Create e-commerce child category (pending admin approval) */
exports.createChildCategory = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const subCategoryId = normalizeRequired(req.body.subCategory ?? req.body.sub_category);
  const categoryId = normalizeOptional(req.body.category);
  const imageFromFile = childCategoryImageFromReq(req);
  const image = normalizeOptional(imageFromFile ?? req.body.image);

  if (!name) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Child category name is required", 400);
  }
  if (!subCategoryId) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Sub-category is required", 400);
  }
  if (!image) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Child category image is required", 400);
  }

  assertObjectId(subCategoryId, "Invalid subCategory id");

  const subCategoryQuery = {
    _id: subCategoryId,
    status: "active",
    mode: "ecom",
  };
  if (categoryId) {
    assertObjectId(categoryId, "Invalid category id");
    subCategoryQuery.category = categoryId;
  }

  const parentSubCategory = await SubCategory.findOne(subCategoryQuery)
    .select("_id name mode category status")
    .lean();
  if (!parentSubCategory) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw new AppError("Sub-category not found or not approved yet", 404);
  }

  const resolvedCategoryId = String(parentSubCategory.category);

  try {
    await assertChildCategoryNameUnique(subCategoryId, name);
    const { approvalRequired, catalogStatus } = await resolveVendorApprovalRequired();

    const childCategory = await ChildCategory.create({
      name,
      image,
      category: resolvedCategoryId,
      subCategory: subCategoryId,
      mode: "ecom",
      role: "Vendor",
      addedById: req.user._id,
      status: catalogStatus,
    });

    const populated = await ChildCategory.findById(childCategory._id)
      .populate("category", "name mode status")
      .populate("subCategory", "name mode status")
      .lean();

    const baseUrl = getPublicBaseUrl(req);
    sendSuccess(
      res,
      approvalRequired
        ? "Child category submitted for admin approval"
        : "Child category created successfully",
      toVendorChildCategory(populated, baseUrl),
      201
    );
  } catch (error) {
    deleteUploadFileByPublicUrl(imageFromFile);
    throw error;
  }
});

/** Vendor's own child categories (includes pending / rejected) */
exports.listMyChildCategories = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search, status, category, subCategory } = req.query;

  const filter = {
    mode: "ecom",
    role: "Vendor",
    addedById: req.user._id,
  };
  if (status) filter.status = String(status).trim();
  if (category) {
    assertObjectId(category, "Invalid category id");
    filter.category = category;
  }
  if (subCategory) {
    assertObjectId(subCategory, "Invalid subCategory id");
    filter.subCategory = subCategory;
  }
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const childCategories = await ChildCategory.find(filter)
    .populate("category", "name mode status")
    .populate("subCategory", "name mode status")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items = childCategories
    .map((doc) => toVendorChildCategory(doc, baseUrl))
    .filter(Boolean);

  sendSuccess(res, "Your child categories fetched", items);
});
