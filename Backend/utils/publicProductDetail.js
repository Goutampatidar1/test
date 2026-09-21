const Product = require("../models/other/product");
const Vendor = require("../models/entity/vendor");
const Wishlist = require("../models/other/wishlist");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const {
  formatInrAmount,
  resolveProductSellingPrice,
  activePublicProductBaseFilter,
  isAdminCatalogProduct,
  resolvePublicProductSeller,
  PLATFORM_STORE_LABEL,
  toPublicProductListCard,
} = require("./publicProductList");
const {
  formatRatingValue,
  getRatingStatsForProducts,
  applyRatingStatsToProduct,
  getUserProductRating,
  getUserRatingsForProducts,
  listProductReviews,
} = require("./productRating");
const { getOrCreateCart, getCartCount, buildProductCartDetailMap } = require("./cart");
const { buildSimpleVariantView, formatSimpleCombination } = require("./productVariants");

const SIMILAR_PRODUCT_LIMIT = 10;
const REVIEW_PREVIEW_LIMIT = 5;

function buildProductGallery(product, baseUrl, selectedImages = []) {
  const urls = [];
  const seen = new Set();
  const add = (src) => {
    const url = toAbsoluteUploadUrl(src, baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  for (const src of selectedImages) add(src);
  if (product?.thumbnail) add(product.thumbnail);
  for (const src of product?.images ?? []) add(src);
  for (const combo of product?.combinations ?? []) {
    for (const src of combo?.images ?? []) add(src);
  }

  return urls;
}

function toPublicVendorDetail(vendor, productCount, baseUrl) {
  if (!vendor) return null;

  const location = [vendor.city, vendor.state].filter(Boolean).join(", ");

  return {
    _id: vendor._id,
    name: vendor.businessName,
    businessName: vendor.businessName,
    location: location || vendor.businessAddress || "",
    city: vendor.city ?? "",
    state: vendor.state ?? "",
    country: vendor.country ?? "",
    shopLogo: vendor.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl) : "",
    productCount: Number(productCount) || 0,
  };
}

function enrichPublicVariants(product, baseUrl) {
  const variants = buildSimpleVariantView(product, baseUrl);
  if (!variants) {
    return { variants: null, combinations: [], colors: [], sizes: [] };
  }

  const combinations = (product.combinations ?? [])
    .filter((combo) => combo.status !== "inactive")
    .map((combo) => {
      const flat = formatSimpleCombination(combo, product, baseUrl);
      return {
        ...flat,
        priceLabel: formatInrAmount(flat.price),
        mrpLabel: flat.mrp > flat.price ? formatInrAmount(flat.mrp) : null,
      };
    });

  const enrichedVariants = {
    ...variants,
    groups: variants.groups.map((group) => ({
      ...group,
      colors: group.colors.map((color) => ({
        ...color,
        priceLabel: formatInrAmount(color.price),
        mrpLabel: color.mrp > color.price ? formatInrAmount(color.mrp) : null,
      })),
    })),
  };

  const sizes = enrichedVariants.groups.map((group) => ({
    value: group.size,
    label: group.label,
    inStock: group.inStock,
    stock: group.stock,
  }));

  const colorMap = new Map();
  for (const group of enrichedVariants.groups) {
    for (const color of group.colors) {
      const displayValue = color.name || color.value || "";
      if (!displayValue) continue;
      const key = String(displayValue);
      if (!colorMap.has(key)) {
        colorMap.set(key, {
          value: color.value || displayValue,
          label: String(displayValue).toUpperCase(),
          name: color.name || "",
          colorCode: color.colorCode || "",
          image: color.images?.[0] || "",
          inStock: color.inStock,
          stock: color.stock,
        });
      } else {
        const entry = colorMap.get(key);
        entry.inStock = entry.inStock || color.inStock;
        entry.stock += color.stock;
        if (!entry.image && color.images?.[0]) entry.image = color.images[0];
      }
    }
  }

  return {
    variants: enrichedVariants,
    combinations,
    colors: Array.from(colorMap.values()),
    sizes,
  };
}

async function fetchSimilarProducts(product, baseUrl, { userId, wishlistSet, myRatingMap, limit = SIMILAR_PRODUCT_LIMIT } = {}) {
  if (!product) return [];

  const filter = activePublicProductBaseFilter({
    _id: { $ne: product._id },
    $or: [{ subCategory: product.subCategory?._id ?? product.subCategory }, { category: product.category?._id ?? product.category }],
  });

  const similar = await Product.find(filter)
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (!similar.length) return [];

  const vendorIds = [...new Set(similar.map((item) => String(item.addedById)).filter(Boolean))];
  const [vendors, ratingStatsMap] = await Promise.all([
    Vendor.find({
      _id: { $in: vendorIds },
      status: "active",
      approvalStatus: "approved",
      isOpen: { $ne: false },
    })
      .select("businessName shopLogo")
      .lean(),
    getRatingStatsForProducts(similar.map((item) => item._id)),
  ]);

  const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));

  return similar
    .map((item) => {
      const seller = resolvePublicProductSeller(item, vendorMap);
      if (!seller) return null;
      const enriched = applyRatingStatsToProduct(item, ratingStatsMap);
      return toPublicProductListCard(enriched, seller, baseUrl, {
        isWishlisted: wishlistSet?.has(String(item._id)) ?? false,
        myRating: myRatingMap?.get(String(item._id)) ?? null,
      });
    })
    .filter(Boolean);
}

async function fetchProductReviewPreview(productId, baseUrl, limit = REVIEW_PREVIEW_LIMIT) {
  return listProductReviews(productId, baseUrl, { skip: 0, limit });
}

function resolveMyRating(userId, savedRating, reviews = []) {
  if (savedRating) return savedRating;
  if (!userId || !reviews.length) return null;

  const mine = reviews.find((row) => String(row.user?._id) === String(userId));
  if (!mine) return null;

  return {
    rating: mine.rating,
    review: mine.review ?? "",
  };
}

async function buildPublicProductDetail(productId, { userId, baseUrl }) {
  const product = await Product.findOne(activePublicProductBaseFilter({ _id: productId }))
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .populate("attributeTitles", "title status")
    .lean();

  if (!product) return null;

  let vendor = await Vendor.findOne({
    _id: product.addedById,
    status: "active",
    approvalStatus: "approved",
    isOpen: { $ne: false },
  })
    .select("businessName shopLogo city state country businessAddress")
    .lean();

  if (!vendor && isAdminCatalogProduct(product)) {
    vendor = {
      _id: product.addedById,
      businessName: PLATFORM_STORE_LABEL,
      shopLogo: "",
      city: "",
      state: "",
      country: "",
      businessAddress: "",
    };
  }

  if (!vendor) return null;

  let wishlistSet = new Set();
  let myRatingMap = new Map();

  if (userId) {
    const wishlist = await Wishlist.findOne({ user: userId }).select("products").lean();
    wishlistSet = new Set((wishlist?.products || []).map((id) => String(id)));
  }

  const [ratingStatsMap, vendorProductCount, similarProducts, reviewPreview, savedRating] =
    await Promise.all([
      getRatingStatsForProducts([product._id]),
      Product.countDocuments(activePublicProductBaseFilter({ addedById: vendor._id })),
      fetchSimilarProducts(product, baseUrl, { userId, wishlistSet, myRatingMap }),
      fetchProductReviewPreview(product._id, baseUrl),
      userId ? getUserProductRating(userId, product._id) : Promise.resolve(null),
    ]);

  const myRating = resolveMyRating(userId, savedRating, reviewPreview.reviews);

  if (userId && similarProducts.length) {
    myRatingMap = await getUserRatingsForProducts(
      userId,
      similarProducts.map((item) => item._id)
    );
    for (const item of similarProducts) {
      item.myRating = myRatingMap.get(String(item._id))?.rating ?? null;
      item.isWishlisted = wishlistSet.has(String(item._id));
    }
  }

  const enrichedProduct = applyRatingStatsToProduct(product, ratingStatsMap);
  const { price, mrp } = resolveProductSellingPrice(enrichedProduct);
  const brand = String(vendor.businessName || enrichedProduct.category?.name || "").trim();
  const variantData = enrichPublicVariants(enrichedProduct, baseUrl);
  const gallery = buildProductGallery(enrichedProduct, baseUrl);

  const category =
    enrichedProduct.category && typeof enrichedProduct.category === "object"
      ? { _id: enrichedProduct.category._id, name: enrichedProduct.category.name }
      : enrichedProduct.category;
  const subCategory =
    enrichedProduct.subCategory && typeof enrichedProduct.subCategory === "object"
      ? { _id: enrichedProduct.subCategory._id, name: enrichedProduct.subCategory.name }
      : enrichedProduct.subCategory;

  let cartCount = 0;
  let cartDetailMap = new Map();
  if (userId) {
    const similarProductIds = similarProducts.map((item) => item._id);
    const [cart, cartDetails] = await Promise.all([
      getOrCreateCart(userId),
      buildProductCartDetailMap(userId, [product._id, ...similarProductIds]),
    ]);
    cartCount = getCartCount(cart);
    cartDetailMap = cartDetails;

    for (const item of similarProducts) {
      const cartDetail = cartDetailMap.get(String(item._id));
      if (cartDetail) item.cart_detail = cartDetail;
    }
  }

  const cartDetail = cartDetailMap.get(String(enrichedProduct._id)) ?? null;

  return {
    _id: enrichedProduct._id,
    name: enrichedProduct.name,
    slug: enrichedProduct.slug,
    sku: enrichedProduct.sku,
    brand,
    brandLabel: brand.toUpperCase(),
    shortDescription: enrichedProduct.shortDescription ?? "",
    description: enrichedProduct.description ?? "",
    price,
    mrp: mrp > price ? mrp : price,
    priceLabel: formatInrAmount(price),
    mrpLabel: mrp > price ? formatInrAmount(mrp) : null,
    discountType: enrichedProduct.discountType,
    discountValue: enrichedProduct.discountValue,
    rating: formatRatingValue(enrichedProduct.averageRating, enrichedProduct.ratingCount),
    ratingCount: Number(enrichedProduct.ratingCount) || 0,
    myRating: myRating?.rating ?? null,
    myReview: myRating?.review ?? "",
    isWishlisted: wishlistSet.has(String(enrichedProduct._id)),
    thumbnail: toAbsoluteUploadUrl(enrichedProduct.thumbnail, baseUrl),
    gallery,
    videos: (enrichedProduct.videos ?? []).map((video) => toAbsoluteUploadUrl(video, baseUrl)),
    variantType: enrichedProduct.variantType,
    variants: variantData.variants,
    colors: variantData.colors,
    sizes: variantData.sizes,
    combinations: variantData.combinations,
    moq: enrichedProduct.moq ?? 1,
    stock: enrichedProduct.stock ?? 0,
    inStock:
      enrichedProduct.variantType === "multi"
        ? variantData.combinations.some((combo) => combo.inStock)
        : (Number(enrichedProduct.stock) || 0) > 0,
    taxType: enrichedProduct.taxType,
    taxValue: enrichedProduct.taxValue,
    category,
    subCategory,
    vendor: toPublicVendorDetail(vendor, vendorProductCount, baseUrl),
    similarProducts,
    reviews: reviewPreview.reviews,
    reviewTotal: reviewPreview.total,
    cartCount,
    ...(cartDetail ? { cart_detail: cartDetail } : {}),
    status: enrichedProduct.status,
    createdAt: enrichedProduct.createdAt,
  };
}

module.exports = {
  buildPublicProductDetail,
  SIMILAR_PRODUCT_LIMIT,
  REVIEW_PREVIEW_LIMIT,
};
