const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const {
  listEcomCategories,
  listEcomSubCategories,
  listEcomChildCategories,
  getCategoryScreenPayload,
  toMobileCategoryItem,
  toMobileSubCategoryItem,
  toMobileChildCategoryItem,
} = require("../../utils/ecomCategory");
const { listSubCategoryProducts } = require("../../utils/ecomProductList");
const { resolveShoppingArea, getAreaVendorIds } = require("../../utils/catalogLocation");

function resolveCategoryId(req) {
  const categoryId =
    req.params.categoryId ?? req.query.categoryId ?? req.query.category;

  if (!categoryId) {
    throw new AppError("categoryId is required", 400);
  }

  const normalized = String(categoryId).trim();
  assertObjectId(normalized, "Invalid category id");
  return normalized;
}

function resolveSubCategoryId(req) {
  const subCategoryId =
    req.params.subCategoryId ?? readSubCategoryIdQuery(req.query);

  if (!subCategoryId) {
    throw new AppError("subCategoryId is required", 400);
  }

  const normalized = String(subCategoryId).trim();
  assertObjectId(normalized, "Invalid sub-category id");
  return normalized;
}

function resolveOptionalCategoryId(req) {
  const categoryId = req.params.categoryId ?? req.query.categoryId ?? req.query.category;
  if (!categoryId) return null;

  const normalized = String(categoryId).trim();
  assertObjectId(normalized, "Invalid category id");
  return normalized;
}

function readSubCategoryIdQuery(query = {}) {
  return (
    query.subCategoryId ??
    query.subCategory ??
    query.subCategories ??
    query.sub_category ??
    query["sub-categories"] ??
    query["sub-categorys"] ??
    query["sub-category"] ??
    query.subCategorys
  );
}

function resolveOptionalSubCategoryId(req) {
  const subCategoryId =
    req.params.subCategoryId ?? readSubCategoryIdQuery(req.query);

  if (!subCategoryId) return null;

  const normalized = String(subCategoryId).trim();
  assertObjectId(normalized, "Invalid sub-category id");
  return normalized;
}

exports.listCategories = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const search = req.query.search ?? req.query.q ?? "";
  const baseUrl = getPublicBaseUrl(req);

  const area = await resolveShoppingArea(req);
  const vendorIds = await getAreaVendorIds(area);

  const rows = await listEcomCategories({ search, skip, limit, vendorIds });
  const items = rows.map((row) => toMobileCategoryItem(row, baseUrl)).filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Categories fetched",
    data: items,
  });
});

/** Category screen — tabs + subcategories grid */
exports.getCategoryDetail = asyncHandler(async (req, res) => {
  const categoryId = resolveCategoryId(req);
  const search = req.query.search ?? req.query.q ?? "";
  const baseUrl = getPublicBaseUrl(req);

  const area = await resolveShoppingArea(req);
  const vendorIds = await getAreaVendorIds(area);

  const payload = await getCategoryScreenPayload(categoryId, baseUrl, { search, vendorIds });

  return res.status(200).json({
    status: true,
    message: "Category detail fetched",
    data: [payload],
  });
});

exports.listSubCategories = asyncHandler(async (req, res) => {
  const categoryId = resolveCategoryId(req);
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const search = req.query.search ?? req.query.q ?? "";
  const baseUrl = getPublicBaseUrl(req);

  const area = await resolveShoppingArea(req);
  const vendorIds = await getAreaVendorIds(area);

  // Only sub-categories that have at least one public/listable product
  const rows = await listEcomSubCategories(categoryId, {
    search,
    skip,
    limit,
    onlyWithProducts: true,
    vendorIds,
  });
  const items = rows.map((row) => toMobileSubCategoryItem(row, baseUrl)).filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Sub-categories fetched",
    data: items,
  });
});

exports.listChildCategories = asyncHandler(async (req, res) => {
  const subCategoryId = resolveOptionalSubCategoryId(req);
  const categoryId = resolveOptionalCategoryId(req);
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const search = req.query.search ?? req.query.q ?? "";
  const baseUrl = getPublicBaseUrl(req);

  const area = await resolveShoppingArea(req);
  const vendorIds = await getAreaVendorIds(area);

  const rows = await listEcomChildCategories({
    search,
    skip,
    limit,
    categoryId,
    subCategoryId,
    vendorIds,
  });
  const items = rows.map((row) => toMobileChildCategoryItem(row, baseUrl)).filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Child categories fetched",
    data: items,
  });
});

/** Product list for a sub-category (Fashion → Footwear → products) */
exports.listSubCategoryProducts = asyncHandler(async (req, res) => {
  const subCategoryId = resolveSubCategoryId(req);
  const baseUrl = getPublicBaseUrl(req);
  const userId = req.user?._id ?? null;

  const vendorId = req.query.vendor ?? req.query.vendorId ?? req.query.vendor_id;
  let vendorIds = undefined;
  if (!vendorId) {
    const area = await resolveShoppingArea(req);
    vendorIds = await getAreaVendorIds(area);
  }

  const result = await listSubCategoryProducts(subCategoryId, req.query, userId, baseUrl, { vendorIds });

  return res.status(200).json({
    status: result.items.length > 0,
    message: "Products fetched",
    data: result.items,
    subCategory: result.subCategory,
    pagination: result.pagination,
    filters: result.filters,
    sortOptions: result.sortOptions,
  });
});
