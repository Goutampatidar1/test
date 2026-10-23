const Product = require("../models/other/product");
const SubCategory = require("../models/other/subCategory");
const Vendor = require("../models/entity/vendor");
const Wishlist = require("../models/other/wishlist");
const AppError = require("./AppError");
const { searchFilter } = require("./listQuery");
const {
  activePublicProductBaseFilter,
  resolvePublicProductSeller,
  toPublicProductListCard,
  resolveProductListSort,
  parseProductPriceRange,
  buildProductPriceRangeFilter,
  PRODUCT_SORT_OPTIONS,
} = require("./publicProductList");
const { getRatingStatsForProducts, applyRatingStatsToProduct, getUserRatingsForProducts } = require("./productRating");
const { getPublicBaseUrl } = require("./mediaUrl");
const mongoose = require("mongoose");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

async function assertEcomSubCategory(subCategoryId) {
  const subCategory = await SubCategory.findOne({
    _id: toObjectId(subCategoryId),
    status: "active",
    mode: "ecom",
  })
    .populate("category", "name mode status")
    .lean();

  if (!subCategory) {
    throw new AppError("Sub-category not found", 404);
  }

  return subCategory;
}

function toSubCategoryHeader(subCategory) {
  const category =
    subCategory.category && typeof subCategory.category === "object"
      ? subCategory.category
      : null;

  return {
    _id: subCategory._id,
    name: subCategory.name,
    categoryId: category?._id ?? subCategory.category,
    categoryName: category?.name ?? "",
  };
}

async function listMobileProducts(query = {}, userId = null, baseUrl = "", options = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const { category, subCategory, search, variantType, sort, minRating, minDiscount } = query;
  const childCategory = query.childCategory ?? query.childCategoryId ?? query.child_category;
  const vendorId = query.vendor ?? query.vendorId ?? query.vendor_id;
  const { minPrice, maxPrice } = parseProductPriceRange(query);

  let filter = activePublicProductBaseFilter();

  if (category) {
    filter.category = category;
  }
  if (subCategory) {
    filter.subCategory = subCategory;
  }
  if (childCategory) {
    filter.childCategory = childCategory;
  }
  if (vendorId) {
    filter.role = "Vendor";
    filter.addedById = vendorId;
  }
  if (variantType) {
    const vt = String(variantType).trim();
    if (!["single", "multi"].includes(vt)) {
      throw new AppError("Invalid variantType. Use single or multi", 400);
    }
    filter.variantType = vt;
  }
  if (minRating) {
    const r = Number(minRating);
    if (!Number.isNaN(r) && r > 0) {
      filter.averageRating = { $gte: r };
    }
  }
  if (minDiscount) {
    const d = Number(minDiscount);
    if (!Number.isNaN(d) && d > 0) {
      filter.discountValue = { $gte: d };
    }
  }

  const priceRangeFilter = buildProductPriceRangeFilter(minPrice, maxPrice);
  if (priceRangeFilter) {
    Object.assign(filter, priceRangeFilter);
  }

  // Location filter:
  // vendor=<id> (shop page): do not apply city filter.
  let areaVendorIds = options.vendorIds;
  if (!vendorId && areaVendorIds === undefined) {
    const { resolveShoppingArea, getAreaVendorIds } = require("./catalogLocation");
    const area = await resolveShoppingArea({ query, user: userId ? { _id: userId } : null });
    areaVendorIds = await getAreaVendorIds(area);
  }
  if (!vendorId && areaVendorIds !== null && areaVendorIds !== undefined) {
    const { applyAreaToProductFilter } = require("./catalogLocation");
    filter = applyAreaToProductFilter(filter, areaVendorIds);
  }

  const searchOr = searchFilter(search, ["name", "slug", "description", "shortDescription", "sku"]);
  if (searchOr) {
    Object.assign(filter, searchOr);
  }

  const sortSpec = resolveProductListSort(sort);

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name mode status")
      .populate("subCategory", "name status")
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
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
      .select("businessName shopLogo city subDistrict")
      .lean(),
    getRatingStatsForProducts(productIds),
  ]);
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

  let wishlistSet = new Set();
  let myRatingMap = new Map();

  if (userId) {
    const [wishlist, ratings] = await Promise.all([
      Wishlist.findOne({ user: userId }).select("products").lean(),
      getUserRatingsForProducts(
        userId,
        products.map((product) => product._id)
      ),
    ]);
    wishlistSet = new Set((wishlist?.products || []).map((id) => String(id)));
    myRatingMap = ratings;
  }

  const resolvedBaseUrl = baseUrl || getPublicBaseUrl();
  const items = products
    .map((product) => {
      const seller = resolvePublicProductSeller(product, vendorMap);
      if (!seller) return null;
      const enrichedProduct = applyRatingStatsToProduct(product, ratingStatsMap);
      return toPublicProductListCard(enrichedProduct, seller, resolvedBaseUrl, {
        isWishlisted: wishlistSet.has(String(product._id)),
        myRating: myRatingMap.get(String(product._id)) ?? null,
      });
    })
    .filter(Boolean);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
    filters: {
      search: search ? String(search).trim() : null,
      category: category ?? null,
      subCategory: subCategory ?? null,
      childCategory: childCategory ?? null,
      vendor: vendorId ?? null,
      minPrice,
      maxPrice,
      sort: sort ? String(sort).trim().toLowerCase() : null,
      variantType: variantType ?? null,
      minRating: minRating ? Number(minRating) : null,
      minDiscount: minDiscount ? Number(minDiscount) : null,
    },
    sortOptions: PRODUCT_SORT_OPTIONS,
  };
}

async function listSubCategoryProducts(subCategoryId, query = {}, userId = null, baseUrl = "", options = {}) {
  const subCategory = await assertEcomSubCategory(subCategoryId);
  const result = await listMobileProducts(
    {
      ...query,
      subCategory: String(subCategory._id),
      category: subCategory.category?._id
        ? String(subCategory.category._id)
        : String(subCategory.category || ""),
    },
    userId,
    baseUrl,
    options
  );

  return {
    subCategory: toSubCategoryHeader(subCategory),
    ...result,
  };
}

module.exports = {
  listMobileProducts,
  listSubCategoryProducts,
  assertEcomSubCategory,
  toSubCategoryHeader,
};
