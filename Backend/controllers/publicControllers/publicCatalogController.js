const Category = require("../../models/other/category");
const SubCategory = require("../../models/other/subCategory");
const Product = require("../../models/other/product");
const Vendor = require("../../models/entity/vendor");
const Wishlist = require("../../models/other/wishlist");
const Faq = require("../../models/other/faq");
const Amenity = require("../../models/other/amenities");
const Venue = require("../../models/other/venue");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const {
  toPublicCategory,
  toVendorCategory,
  toVendorSubCategory,
  toPublicVenueType,
  toPublicVenueSummary,
  toPublicVenueDetail,
  toPublicSubCategory,
  toPublicFaq,
  toPublicProductSummary,
  toPublicProductDetail,
} = require("../../utils/mobilePresenters");
const {
  resolveProductListSort,
  parseProductPriceRange,
  buildProductPriceRangeFilter,
  activePublicProductBaseFilter,
  resolvePublicProductSeller,
  getCatalogPriceBounds,
  PRODUCT_SORT_OPTIONS,
  toPublicProductFilterCategory,
  toPublicProductListCard,
  formatInrAmount,
  getCategoryIdsWithPublicProducts,
} = require("../../utils/publicProductList");
const { sendSuccess } = require("../../utils/apiResponse");
const { listActiveBanners, resolveRequestCity } = require("../../utils/bannerQuery");
const { buildPublicHome } = require("../../utils/publicHome");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { formatRatingValue, getUserProductRating, getUserRatingsForProducts, getRatingStatsForProducts, applyRatingStatsToProduct } = require("../../utils/productRating");
const { buildPublicProductDetail } = require("../../utils/publicProductDetail");
const { buildProductCartDetailMap } = require("../../utils/cart");
const { activePublicVenueListingFilter, activePublicVenueListingFilterOpen, isVenueListable } = require("../../utils/publicVenueList");

const ALLOWED_MODES = new Set(["ecom", "venue"]);

function readCatalogSubCategoryId(query = {}, params = {}) {
  const raw = params.subCategoryId ?? query.subCategory ?? query.subCategoryId ?? query.sub_category;
  if (!raw) return null;
  return String(raw).trim();
}

function readCatalogChildCategoryId(query = {}) {
  const raw = query.childCategory ?? query.childCategoryId ?? query.child_category;
  if (!raw) return null;
  return String(raw).trim();
}

function readCatalogVendorId(query = {}) {
  const raw = query.vendor ?? query.vendorId ?? query.vendor_id ?? query.addedById;
  if (!raw) return null;
  return String(raw).trim();
}

function readCatalogCategoryId(query = {}, params = {}) {
  const raw = params.categoryId ?? query.category ?? query.categoryId ?? query.category_id;
  if (!raw) return null;
  return String(raw).trim();
}

function activeVenueCategoryFilter(search) {
  const filter = { status: "active", mode: "venue" };
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);
  return filter;
}

async function activePublicVenueFilter(extra = {}) {
  return activePublicVenueListingFilterOpen(extra);
}

function resolveVenueListSort(sort) {
  const key = String(sort || "").trim().toLowerCase();
  if (key === "price_asc") return { basePrice: 1, createdAt: -1 };
  if (key === "price_desc") return { basePrice: -1, createdAt: -1 };
  if (key === "capacity_asc") return { capacity: 1, createdAt: -1 };
  if (key === "capacity_desc") return { capacity: -1, createdAt: -1 };
  return { createdAt: -1 };
}

async function assertActiveVenueCategory(categoryId) {
  assertObjectId(categoryId, "Invalid category id");
  const cat = await Category.findOne({
    _id: categoryId,
    status: "active",
    mode: "venue",
  })
    .select("_id name")
    .lean();
  if (!cat) throw new AppError("Category not found", 404);
  return cat;
}

async function venueCountByCategoryIds(categoryIds) {
  if (!categoryIds.length) return new Map();
  const listingFilter = await activePublicVenueListingFilterOpen();
  const rows = await Venue.aggregate([
    {
      $match: {
        ...listingFilter,
        category: { $in: categoryIds },
      },
    },
    { $group: { _id: "$category", venueCount: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.venueCount]));
}

/** Products visible on mobile storefront */
function activeProductFilter(extra = {}) {
  return {
    status: "active",
    adminApproved: true,
    ...extra,
  };
}

/** Public banners — defaults to user-app banners; pass ?type=ecom|venue|user to override */
exports.listBanners = asyncHandler(async (req, res) => {
  const city = resolveRequestCity(req);
  const rawType = String(req.query?.type ?? req.query?.targetType ?? "user").trim().toLowerCase();
  const targetType = ["ecom", "venue", "user"].includes(rawType) ? rawType : "user";
  const baseUrl = getPublicBaseUrl(req);
  const items = await listActiveBanners({ city, targetType, baseUrl });
  sendSuccess(res, "Banners fetched", items);
});

/**
 * GET /api/public/home
 * - banners (admin + Banner-plan vendor banners)
 * - getVerified / verifiedVendors (Get Verified plan)
 * - productListing / presenceProducts (Product Presence First — 1 product per subscribed vendor)
 *
 * Query: type=ecom|venue, city, verifiedLimit, presenceLimit
 */
exports.getHome = asyncHandler(async (req, res) => {
  const city = resolveRequestCity(req);
  const targetType = String(req.query?.type ?? req.query?.targetType ?? "ecom").trim().toLowerCase();
  const baseUrl = getPublicBaseUrl(req);
  const verifiedLimit = Number(req.query?.verifiedLimit) || 50;
  const presenceLimit = req.query?.presenceLimit ? Number(req.query.presenceLimit) : undefined;

  const home = await buildPublicHome({
    city,
    targetType,
    baseUrl,
    verifiedLimit,
    presenceLimit,
  });

  sendSuccess(res, "Home fetched", home);
});

/** Home "Venue types" carousel — paginated (no auth) */
exports.listVenueTypes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search } = req.query;
  const baseUrl = getPublicBaseUrl(req);
  const filter = activeVenueCategoryFilter(search);

  let categories = await Category.find(filter).sort({ name: 1 }).lean();
  const countMap = await venueCountByCategoryIds(categories.map((c) => c._id));
  categories = categories.filter((c) => (countMap.get(String(c._id)) || 0) > 0);

  const total = categories.length;
  const pageRows = categories.slice(skip, skip + limit);
  const venueTypes = pageRows
    .map((c) =>
      toPublicVenueType(c, baseUrl, {
        venueCount: countMap.get(String(c._id)) || 0,
      })
    )
    .filter(Boolean);

  return res.status(200).json({
    status: venueTypes.length > 0,
    message: "Venue types fetched",
    data: venueTypes,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/** "View all" / Available Venues grid — full list, flat array (no auth) */
exports.listAllVenueTypes = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const baseUrl = getPublicBaseUrl(req);
  const filter = activeVenueCategoryFilter(search);

  let categories = await Category.find(filter).sort({ name: 1 }).lean();
  const countMap = await venueCountByCategoryIds(categories.map((c) => c._id));
  categories = categories.filter((c) => (countMap.get(String(c._id)) || 0) > 0);

  const items = categories
    .map((c) =>
      toPublicVenueType(c, baseUrl, {
        venueCount: countMap.get(String(c._id)) || 0,
      })
    )
    .filter(Boolean);

  sendSuccess(res, "Available venue types fetched", items);
});

/** Venues list when user taps a category (no auth) */
exports.listVenues = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { subCategory, city, search, sort } = req.query;
  const categoryId = req.params.categoryId ?? req.query.category;
  const baseUrl = getPublicBaseUrl(req);

  const filter = await activePublicVenueFilter();

  if (categoryId) {
    await assertActiveVenueCategory(categoryId);
    filter.category = categoryId;
  }
  if (subCategory) {
    assertObjectId(subCategory, "Invalid subCategory id");
    filter.subCategory = subCategory;
  }
  if (city && String(city).trim()) {
    const cityRx = new RegExp(
      `^${String(city).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );
    filter.city = cityRx;
  }

  const searchOr = searchFilter(search, [
    "name",
    "description",
    "shortDescription",
    "address",
    "city",
  ]);
  if (searchOr) Object.assign(filter, searchOr);

  const sortSpec = resolveVenueListSort(sort);

  const [venues, total] = await Promise.all([
    Venue.find(filter)
      .populate("category", "name mode status")
      .populate("subCategory", "name status")
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .lean(),
    Venue.countDocuments(filter),
  ]);

  const venueList = venues
    .filter((venue) => isVenueListable(venue))
    .map((v) => toPublicVenueSummary(v, baseUrl))
    .filter(Boolean);

  return res.status(200).json({
    status: venueList.length > 0,
    message: "Venues fetched",
    data: venueList,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/** Single venue detail for mobile (no auth) */
exports.getVenueById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid venue id");
  const baseUrl = getPublicBaseUrl(req);

  const venue = await Venue.findOne(await activePublicVenueFilter({ _id: req.params.id }))
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .populate({
      path: "amenities",
      match: { status: "active" },
      select: "name icon description status",
    })
    .lean();

  if (!venue) {
    throw new AppError("Venue not found", 404);
  }

  let vendorDoc = null;
  if (venue.role === "VenueVendor" && venue.addedById) {
    const VenueVendor = require("../../models/entity/venueVendor");
    vendorDoc = await VenueVendor.findById(venue.addedById)
      .select("name businessName businessPhone phone showPhoneOnApp approvalStatus status isOpen")
      .lean();
  }

  sendSuccess(res, "Venue details fetched", toPublicVenueDetail(venue, baseUrl, { vendorDoc }));
});

exports.listCategories = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { mode, search } = req.query;

  const filter = { status: "active" };
  if (mode) {
    const normalizedMode = String(mode).trim();
    if (!ALLOWED_MODES.has(normalizedMode)) {
      throw new AppError("Invalid mode. Use ecom or venue", 400);
    }
    filter.mode = normalizedMode;
  } else {
    filter.mode = "ecom";
  }

  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const includeEmpty =
    String(req.query.includeEmpty ?? "").trim().toLowerCase() === "true" ||
    String(req.query.includeEmpty ?? "").trim() === "1";

  if (filter.mode === "ecom") {
    if (!includeEmpty) {
      // Only return categories that have at least one active ecom subcategory.
      const categoryIdsWithSubs = await SubCategory.distinct("category", {
        status: "active",
        mode: "ecom",
        category: { $ne: null },
      });
      filter._id = { $in: categoryIdsWithSubs.filter(Boolean) };
    }

    const categories = await Category.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean();
    const baseUrl = getPublicBaseUrl(req);
    const items = categories.map((doc) => toVendorCategory(doc, baseUrl)).filter(Boolean);
    sendSuccess(res, "Categories fetched", items);
    return;
  }

  let categories = await Category.find(filter).sort({ name: 1 }).lean();

  if (!includeEmpty) {
    const countMap = await venueCountByCategoryIds(categories.map((c) => c._id));
    categories = categories.filter((c) => (countMap.get(String(c._id)) || 0) > 0);
  }

  categories = categories.slice(skip, skip + limit);

  const baseUrl = getPublicBaseUrl(req);
  const items = categories.map((doc) => toPublicVenueType(doc, baseUrl)).filter(Boolean);

  sendSuccess(res, "Categories fetched", items);
});

/**
 * Venue-vendor panel "Add Venue" category dropdown.
 * Returns all active venue categories (Admin + VenueVendor), including ones with 0 venues.
 */
exports.listVenueCatalogCategories = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search } = req.query;
  const baseUrl = getPublicBaseUrl(req);

  const filter = {
    status: "active",
    mode: "venue",
  };
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [categories, total] = await Promise.all([
    Category.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);

  const items = categories
    .map((doc) => {
      const item = toPublicVenueType(doc, baseUrl);
      if (!item) return null;
      return {
        ...item,
        _id: String(item._id),
        role: doc.role || null,
      };
    })
    .filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Venue categories fetched",
    data: items,
    pagination: {
      page: paginationQuery.page ? Number(paginationQuery.page) || 1 : 1,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.listSubCategories = asyncHandler(async (req, res) => {
  const categoryId = readCatalogCategoryId(req.query, req.params);
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { mode, search } = req.query;

  const filter = { status: "active" };
  if (categoryId) {
    assertObjectId(categoryId, "Invalid category id");
    filter.category = categoryId;
  }
  if (mode) {
    const normalizedMode = String(mode).trim();
    if (!ALLOWED_MODES.has(normalizedMode)) {
      throw new AppError("Invalid mode. Use ecom or venue", 400);
    }
    filter.mode = normalizedMode;
  } else {
    filter.mode = "ecom";
  }

  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const subCategories = await SubCategory.find(filter)
    .populate("category", "name mode status")
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const baseUrl = getPublicBaseUrl(req);
  const items =
    filter.mode === "venue"
      ? subCategories.map((doc) => toPublicSubCategory(doc)).filter(Boolean)
      : subCategories.map((doc) => toVendorSubCategory(doc, baseUrl)).filter(Boolean);

  sendSuccess(res, "Sub-categories fetched", items);
});

async function productCountByCategoryIds(categoryIds) {
  if (!categoryIds.length) return new Map();
  const productFilter = activePublicProductBaseFilter({
    category: { $in: categoryIds },
  });
  const rows = await Product.aggregate([
    { $match: productFilter },
    { $group: { _id: "$category", productCount: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.productCount]));
}

/** E-commerce categories for product filter popup (horizontal chips) */
exports.listProductFilterCategories = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination({
    ...req.query,
    limit: req.query.limit ?? "100",
  });
  const { search } = req.query;

  const filter = { status: "active", mode: "ecom" };
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const categoryIds = await getCategoryIdsWithPublicProducts(Product);
  if (!categoryIds.length) {
    return res.status(200).json({
      status: false,
      message: "Product filter categories fetched",
      data: [],
      pagination: { page, limit, total: 0, pages: 1 },
    });
  }
  filter._id = { $in: categoryIds };

  const [categories, total] = await Promise.all([
    Category.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Category.countDocuments(filter),
  ]);

  const countMap = await productCountByCategoryIds(categories.map((c) => c._id));
  const baseUrl = getPublicBaseUrl(req);

  const items = categories
    .map((doc) =>
      toPublicProductFilterCategory(doc, baseUrl, countMap.get(String(doc._id)) ?? 0)
    )
    .filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Product filter categories fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getProductFilterOptions = asyncHandler(async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);

  const [categories, priceBounds] = await Promise.all([
    Category.find({ status: "active", mode: "ecom" }).sort({ name: 1 }).lean(),
    getCatalogPriceBounds(Product),
  ]);

  const categoryIds = categories.map((c) => c._id);
  const countMap = await productCountByCategoryIds(categoryIds);

  const minCatalogPrice = priceBounds.min;
  const maxCatalogPrice = priceBounds.max;

  return res.status(200).json({
    status: true,
    message: "Product filter options fetched",
    data: {
      categories: categories
        .filter((doc) => (countMap.get(String(doc._id)) ?? 0) > 0)
        .map((doc) => toVendorCategory(doc, baseUrl))
        .filter(Boolean),
      priceRange: {
        min: minCatalogPrice,
        max: maxCatalogPrice,
        minLabel: formatInrAmount(minCatalogPrice),
        maxLabel: formatInrAmount(maxCatalogPrice),
        currency: "INR",
        symbol: "₹",
      },
      sortOptions: PRODUCT_SORT_OPTIONS,
    },
  });
});

exports.listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const categoryId = readCatalogCategoryId(req.query, req.params);
  const subCategoryId = readCatalogSubCategoryId(req.query, req.params);
  const childCategoryId = readCatalogChildCategoryId(req.query);
  const vendorId = readCatalogVendorId(req.query);
  const { search, variantType, sort } = req.query;
  const { minPrice, maxPrice } = parseProductPriceRange(req.query);

  const filter = activePublicProductBaseFilter();

  if (categoryId) {
    assertObjectId(categoryId, "Invalid category id");
    filter.category = categoryId;
  }
  if (subCategoryId) {
    assertObjectId(subCategoryId, "Invalid subCategory id");
    filter.subCategory = subCategoryId;
  }
  if (childCategoryId) {
    assertObjectId(childCategoryId, "Invalid childCategory id");
    filter.childCategory = childCategoryId;
  }
  if (vendorId) {
    assertObjectId(vendorId, "Invalid vendor id");
    filter.addedById = vendorId;
    filter.role = "Vendor";
  }
  if (variantType) {
    const vt = String(variantType).trim();
    if (!["single", "multi"].includes(vt)) {
      throw new AppError("Invalid variantType. Use single or multi", 400);
    }
    filter.variantType = vt;
  }

  const priceRangeFilter = buildProductPriceRangeFilter(minPrice, maxPrice);
  if (priceRangeFilter) Object.assign(filter, priceRangeFilter);

  const searchOr = searchFilter(search, ["name", "slug", "description", "shortDescription", "sku"]);
  if (searchOr) Object.assign(filter, searchOr);

  const sortSpec = resolveProductListSort(sort);

  const [products, total, priceBounds] = await Promise.all([
    Product.find(filter)
      .populate("category", "name mode status")
      .populate("subCategory", "name status")
      .populate("childCategory", "name status")
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
    getCatalogPriceBounds(Product),
  ]);

  const vendorIds = [...new Set(products.map((p) => String(p.addedById)).filter(Boolean))];
  const productIds = products.map((product) => product._id);

  const [vendors, ratingStatsMap] = await Promise.all([
    Vendor.find({
      _id: { $in: vendorIds },
      status: "active",
      approvalStatus: "approved",
      isOpen: { $ne: false },
    })
      .select("businessName shopLogo")
      .lean(),
    getRatingStatsForProducts(productIds),
  ]);
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

  let wishlistSet = new Set();
  let myRatingMap = new Map();
  let cartDetailMap = new Map();
  if (req.user?._id) {
    const [wishlist, ratings, cartDetails] = await Promise.all([
      Wishlist.findOne({ user: req.user._id }).select("products").lean(),
      getUserRatingsForProducts(
        req.user._id,
        products.map((product) => product._id)
      ),
      buildProductCartDetailMap(req.user._id, productIds),
    ]);
    wishlistSet = new Set((wishlist?.products || []).map((id) => String(id)));
    myRatingMap = ratings;
    cartDetailMap = cartDetails;
  }

  const baseUrl = getPublicBaseUrl(req);
  const items = products
    .map((product) => {
      const seller = resolvePublicProductSeller(product, vendorMap);
      if (!seller) return null;
      const enrichedProduct = applyRatingStatsToProduct(product, ratingStatsMap);
      return toPublicProductListCard(enrichedProduct, seller, baseUrl, {
        isWishlisted: wishlistSet.has(String(product._id)),
        myRating: myRatingMap.get(String(product._id)) ?? null,
        cartDetail: cartDetailMap.get(String(product._id)) ?? null,
      });
    })
    .filter(Boolean);

  return res.status(200).json({
    status: true,
    message: "Products fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
    filters: {
      search: search ? String(search).trim() : null,
      category: categoryId ?? null,
      subCategory: subCategoryId ?? null,
      childCategory: childCategoryId ?? null,
      vendor: vendorId ?? null,
      minPrice,
      maxPrice,
      sort: sort ? String(sort).trim().toLowerCase() : null,
      variantType: variantType ?? null,
    },
    priceRange: {
      min: priceBounds.min,
      max: priceBounds.max,
    },
  });
});

exports.getProductDetail = asyncHandler(async (req, res) => {
  assertObjectId(req.params.productId, "Invalid product id");
  const baseUrl = getPublicBaseUrl(req);

  const detail = await buildPublicProductDetail(req.params.productId, {
    userId: req.user?._id,
    baseUrl,
  });

  if (!detail) {
    throw new AppError("Product not found", 404);
  }

  return res.status(200).json({
    status: true,
    message: "Product detail fetched",
    data: [detail],
  });
});

exports.getProductById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, "Invalid product id");

  const product = await Product.findOne(activeProductFilter({ _id: req.params.id }))
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .lean();

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  let myRating = null;
  if (req.user?._id) {
    myRating = await getUserProductRating(req.user._id, product._id);
  }

  const ratingStatsMap = await getRatingStatsForProducts([product._id]);
  const enrichedProduct = applyRatingStatsToProduct(product, ratingStatsMap);
  const detail = toPublicProductDetail(enrichedProduct);
  sendSuccess(res, "Product details fetched", {
    ...detail,
    rating: formatRatingValue(enrichedProduct.averageRating, enrichedProduct.ratingCount),
    ratingCount: Number(enrichedProduct.ratingCount) || 0,
    myRating: myRating?.rating ?? null,
    myReview: myRating?.review ?? "",
  });
});

exports.getProductBySlug = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug ?? "").trim().toLowerCase();
  if (!slug) {
    throw new AppError("Invalid product slug", 400);
  }

  const product = await Product.findOne(activeProductFilter({ slug }))
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .lean();

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  let myRating = null;
  if (req.user?._id) {
    myRating = await getUserProductRating(req.user._id, product._id);
  }

  const ratingStatsMap = await getRatingStatsForProducts([product._id]);
  const enrichedProduct = applyRatingStatsToProduct(product, ratingStatsMap);
  const detail = toPublicProductDetail(enrichedProduct);
  sendSuccess(res, "Product details fetched", {
    ...detail,
    rating: formatRatingValue(enrichedProduct.averageRating, enrichedProduct.ratingCount),
    ratingCount: Number(enrichedProduct.ratingCount) || 0,
    myRating: myRating?.rating ?? null,
    myReview: myRating?.review ?? "",
  });
});

exports.listAmenities = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search } = req.query;

  const filter = { status: "active" };
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [amenities, total] = await Promise.all([
    Amenity.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Amenity.countDocuments(filter),
  ]);

  sendSuccess(res, "Amenities fetched", {
    items: amenities.map((item) => ({
      _id: item._id,
      name: item.name,
      icon: item.icon,
      status: item.status,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.listFaqs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search } = req.query;

  const filter = { status: "active" };
  const searchOr = searchFilter(search, ["question", "answer"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [faqs, total] = await Promise.all([
    Faq.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Faq.countDocuments(filter),
  ]);

  sendSuccess(res, "FAQs fetched", {
    items: faqs.map(toPublicFaq),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});
