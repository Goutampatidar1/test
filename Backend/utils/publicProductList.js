const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { formatRatingValue } = require("./productRating");

function formatInrAmount(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

function applyDiscount(price, discountType, discountValue) {
  const base = Number(price) || 0;
  const discount = Number(discountValue) || 0;
  if (discount <= 0) return base;
  if (discountType === "flat") return Math.max(0, base - discount);
  return Math.max(0, Math.round(base - (base * discount) / 100));
}

function resolveProductSellingPrice(product) {
  if (product.variantType === "multi" && Array.isArray(product.combinations) && product.combinations.length) {
    const active = product.combinations.filter((c) => c.status !== "inactive");
    if (active.length) {
      const prices = active.map((combo) =>
        applyDiscount(
          combo.price,
          product.discountType,
          combo.discountValue ?? product.discountValue
        )
      );
      const mrpPrices = active.map((c) => Number(c.price) || 0);
      return {
        price: Math.min(...prices),
        mrp: Math.min(...mrpPrices),
      };
    }
  }

  const mrp = Number(product.price) || 0;
  return {
    price: applyDiscount(mrp, product.discountType, product.discountValue),
    mrp,
  };
}

function resolveProductListSort(sort) {
  const key = String(sort || "").trim().toLowerCase();
  if (key === "price_asc" || key === "price_low" || key === "low_to_high") {
    return { price: 1, createdAt: -1 };
  }
  if (key === "price_desc" || key === "price_high" || key === "high_to_low") {
    return { price: -1, createdAt: -1 };
  }
  if (key === "name_asc" || key === "name") return { name: 1, createdAt: -1 };
  if (key === "name_desc") return { name: -1, createdAt: -1 };
  return { createdAt: -1 };
}

const PRODUCT_SORT_OPTIONS = [
  { value: "price_desc", label: "Price - High to Low" },
  { value: "price_asc", label: "Price - Low to High" },
];

function parsePriceQuery(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n);
}

function parseProductPriceRange(query = {}) {
  const minPrice = parsePriceQuery(query.minPrice ?? query.priceMin ?? query.min);
  const maxPrice = parsePriceQuery(query.maxPrice ?? query.priceMax ?? query.max);
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    return { minPrice: maxPrice, maxPrice: minPrice };
  }
  return { minPrice, maxPrice };
}

function buildProductPriceRangeFilter(minPrice, maxPrice) {
  if (minPrice == null && maxPrice == null) return null;

  const range = {};
  if (minPrice != null) range.$gte = minPrice;
  if (maxPrice != null) range.$lte = maxPrice;

  return {
    $or: [
      { price: range },
      {
        combinations: {
          $elemMatch: {
            status: { $ne: "inactive" },
            price: range,
          },
        },
      },
    ],
  };
}

const PLATFORM_STORE_LABEL = "OHO E-BAZAR";

function isAdminCatalogProduct(product) {
  const role = String(product?.role || "").trim();
  return role === "Admin" || role === "admin";
}

function activePublicProductBaseFilter(extra = {}) {
  const { role, ...rest } = extra;
  const filter = {
    status: "active",
    adminApproved: true,
    ...rest,
  };
  if (role !== undefined) {
    filter.role = role;
  } else {
    filter.role = { $in: ["Vendor", "Admin", "admin"] };
  }
  return filter;
}

function resolvePublicProductSeller(product, vendorMap = new Map()) {
  const vendor = vendorMap.get(String(product?.addedById));
  if (vendor) return vendor;
  if (!isAdminCatalogProduct(product)) return null;
  return {
    _id: product.addedById,
    businessName: PLATFORM_STORE_LABEL,
    shopLogo: "",
  };
}

/** Min/max product price across the public catalog (single + active combination prices). */
function catalogPriceBoundsPipeline(matchFilter) {
  return [
    { $match: matchFilter },
    {
      $project: {
        prices: {
          $concatArrays: [
            ["$price"],
            {
              $map: {
                input: {
                  $filter: {
                    input: { $ifNull: ["$combinations", []] },
                    as: "c",
                    cond: { $ne: ["$$c.status", "inactive"] },
                  },
                },
                as: "c",
                in: "$$c.price",
              },
            },
          ],
        },
      },
    },
    { $unwind: "$prices" },
    {
      $group: {
        _id: null,
        minPrice: { $min: "$prices" },
        maxPrice: { $max: "$prices" },
      },
    },
  ];
}

async function getCatalogPriceBounds(ProductModel, extraFilter = {}) {
  const productFilter = activePublicProductBaseFilter(extraFilter);
  const priceStats = await ProductModel.aggregate(catalogPriceBoundsPipeline(productFilter));
  return {
    min: priceStats[0]?.minPrice ?? 0,
    max: priceStats[0]?.maxPrice ?? 0,
  };
}

function toPublicProductFilterCategory(doc, baseUrl, productCount = 0) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    description: doc.description ?? "",
    image: toAbsoluteUploadUrl(doc.image, baseUrl),
    productCount: Number(productCount) || 0,
  };
}

function toPublicProductListCard(product, vendor, baseUrl, { isWishlisted = false, myRating = null, cartDetail = null } = {}) {
  if (!product) return null;

  const category =
    product.category && typeof product.category === "object"
      ? { _id: product.category._id, name: product.category.name }
      : product.category;
  const subCategory =
    product.subCategory && typeof product.subCategory === "object"
      ? { _id: product.subCategory._id, name: product.subCategory.name }
      : product.subCategory;
  const childCategory =
    product.childCategory && typeof product.childCategory === "object"
      ? { _id: product.childCategory._id, name: product.childCategory.name }
      : product.childCategory ?? null;

  const { price, mrp } = resolveProductSellingPrice(product);
  const brand = String(vendor?.businessName || category?.name || "").trim();

  const card = {
    _id: product._id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    brand,
    brandLabel: brand.toUpperCase(),
    shortDescription: product.shortDescription ?? "",
    thumbnail: toAbsoluteUploadUrl(product.thumbnail, baseUrl),
    image: toAbsoluteUploadUrl(product.thumbnail, baseUrl),
    price,
    mrp: mrp > price ? mrp : price,
    priceLabel: formatInrAmount(price),
    mrpLabel: mrp > price ? formatInrAmount(mrp) : null,
    discountType: product.discountType,
    discountValue: product.discountValue,
    stock: product.stock,
    variantType: product.variantType,
    category,
    subCategory,
    childCategory,
    vendor: vendor
      ? {
          _id: vendor._id,
          name: vendor.businessName,
          shopLogo: vendor.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl) : "",
        }
      : null,
    rating: formatRatingValue(product.averageRating, product.ratingCount),
    ratingCount: Number(product.ratingCount) || 0,
    myRating: myRating?.rating ?? null,
    isWishlisted: Boolean(isWishlisted),
    status: product.status,
    createdAt: product.createdAt,
  };

  if (cartDetail) {
    card.cart_detail = cartDetail;
  }

  return card;
}

async function getCategoryIdsWithPublicProducts(ProductModel, { categoryIds } = {}) {
  const match = activePublicProductBaseFilter();
  if (Array.isArray(categoryIds) && categoryIds.length) {
    match.category = { $in: categoryIds };
  }

  const rows = await ProductModel.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "vendors",
        localField: "addedById",
        foreignField: "_id",
        as: "vendorDoc",
      },
    },
    {
      $addFields: {
        vendorDoc: { $arrayElemAt: ["$vendorDoc", 0] },
      },
    },
    {
      $match: {
        $or: [
          { role: { $in: ["Admin", "admin"] } },
          {
            "vendorDoc.status": "active",
            "vendorDoc.approvalStatus": "approved",
            "vendorDoc.isOpen": { $ne: false },
          },
        ],
      },
    },
    { $group: { _id: "$category" } },
  ]);

  return rows.map((row) => row._id).filter(Boolean);
}

async function getSubCategoryIdsWithPublicProducts(ProductModel, { categoryId, subCategoryIds } = {}) {
  const match = activePublicProductBaseFilter({
    subCategory: { $ne: null },
  });
  if (categoryId) {
    match.category = categoryId;
  }
  if (Array.isArray(subCategoryIds) && subCategoryIds.length) {
    match.subCategory = { $in: subCategoryIds };
  }

  const rows = await ProductModel.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "vendors",
        localField: "addedById",
        foreignField: "_id",
        as: "vendorDoc",
      },
    },
    {
      $addFields: {
        vendorDoc: { $arrayElemAt: ["$vendorDoc", 0] },
      },
    },
    {
      $match: {
        $or: [
          { role: { $in: ["Admin", "admin"] } },
          {
            "vendorDoc.status": "active",
            "vendorDoc.approvalStatus": "approved",
            "vendorDoc.isOpen": { $ne: false },
          },
        ],
      },
    },
    { $group: { _id: "$subCategory" } },
  ]);

  return rows.map((row) => row._id).filter(Boolean);
}

module.exports = {
  formatInrAmount,
  applyDiscount,
  resolveProductSellingPrice,
  resolveProductListSort,
  parseProductPriceRange,
  buildProductPriceRangeFilter,
  activePublicProductBaseFilter,
  isAdminCatalogProduct,
  resolvePublicProductSeller,
  PLATFORM_STORE_LABEL,
  getCatalogPriceBounds,
  PRODUCT_SORT_OPTIONS,
  toPublicProductFilterCategory,
  toPublicProductListCard,
  getCategoryIdsWithPublicProducts,
  getSubCategoryIdsWithPublicProducts,
};
