const mongoose = require("mongoose");
const Vendor = require("../models/entity/vendor");
const Product = require("../models/other/product");
const ProductRating = require("../models/other/productRating");
const ProductVideoFeed = require("../models/other/productVideoFeed");
const User = require("../models/entity/user");
const AppError = require("./AppError");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { resolveVendorContactPhone } = require("./publicVendorContact");
const { formatRatingValue, getRatingStatsForProducts, applyRatingStatsToProduct, toPublicProductRatingItem } = require("./productRating");
const { activePublicProductBaseFilter, toPublicProductListCard } = require("./publicProductList");
const { resolveVariantForProduct } = require("./productVideoFeed");

const REVIEW_PREVIEW_LIMIT = 5;
const VIDEO_FEED_LIMIT = 20;

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function buildVendorFullAddress(vendor) {
  return [vendor.businessAddress, vendor.city, vendor.state, vendor.pincode, vendor.country]
    .filter(Boolean)
    .join(", ");
}

function buildVendorLocation(vendor) {
  const cityState = [vendor.city, vendor.state].filter(Boolean).join(", ");
  return cityState || vendor.businessAddress || "";
}

async function assertPublicVendor(vendorId) {
  const { activePublicVendorFilter } = require("./publicVendorVisibility");
  const vendor = await Vendor.findOne(
    activePublicVendorFilter({
      _id: vendorId,
    })
  )
    .populate("category", "name mode status")
    .lean();

  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  return vendor;
}

async function getVendorProductCount(vendorId) {
  return Product.countDocuments(
    activePublicProductBaseFilter({
      addedById: vendorId,
    })
  );
}

async function getVendorRatingStats(vendorId) {
  const rows = await ProductRating.aggregate([
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: "$productDoc" },
    {
      $match: {
        "productDoc.addedById": toObjectId(vendorId),
        "productDoc.status": "active",
        "productDoc.adminApproved": true,
        "productDoc.role": "Vendor",
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  const averageRating = rows[0]?.averageRating ?? 0;
  const ratingCount = rows[0]?.ratingCount ?? 0;

  return {
    rating: formatRatingValue(averageRating, ratingCount),
    ratingCount,
  };
}

async function fetchVendorVideoFeeds(vendorId, baseUrl, limit = VIDEO_FEED_LIMIT) {
  const feeds = await ProductVideoFeed.find({
    vendor: vendorId,
    status: "active",
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (!feeds.length) return [];

  const productIds = [
    ...new Set(feeds.map((feed) => feed.product).filter(Boolean).map((id) => String(id))),
  ];
  const products = await Product.find({
    ...activePublicProductBaseFilter(),
    _id: { $in: productIds },
  }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  return feeds
    .map((feed) => {
      if (!feed.product) {
        return {
          _id: feed._id,
          video: toAbsoluteUploadUrl(feed.video, baseUrl),
          thumbnail: toAbsoluteUploadUrl(feed.thumbnail, baseUrl),
          title: feed.title || "",
          productId: null,
          productName: null,
          productSlug: null,
          variantSku: "",
          shopNow: null,
        };
      }

      const product = productMap.get(String(feed.product));
      if (!product) return null;

      try {
        const variant = resolveVariantForProduct(product, feed.variantSku);
        return {
          _id: feed._id,
          video: toAbsoluteUploadUrl(feed.video, baseUrl),
          thumbnail: toAbsoluteUploadUrl(feed.thumbnail || product.thumbnail, baseUrl),
          title: feed.title || product.name,
          productId: product._id,
          productName: product.name,
          productSlug: product.slug,
          variantSku: variant.sku,
          shopNow: {
            productId: product._id,
            productSlug: product.slug,
            variantSku: variant.sku,
            variantType: product.variantType,
          },
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function fetchVendorReviewPreview(vendorId, baseUrl, limit = REVIEW_PREVIEW_LIMIT) {
  const productIds = await Product.find(
    activePublicProductBaseFilter({ addedById: vendorId })
  )
    .select("_id")
    .lean();

  if (!productIds.length) {
    return { reviews: [], total: 0 };
  }

  const ids = productIds.map((row) => row._id);
  const [rows, total] = await Promise.all([
    ProductRating.find({ product: { $in: ids } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    ProductRating.countDocuments({ product: { $in: ids } }),
  ]);

  const userIds = [...new Set(rows.map((row) => String(row.user)).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name profileImage")
    .lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const reviews = rows
    .map((row) => toPublicProductRatingItem(row, userMap.get(String(row.user)), baseUrl))
    .filter(Boolean);

  return { reviews, total };
}

async function buildPublicVendorProfile(vendorId, baseUrl) {
  const vendor = await assertPublicVendor(vendorId);

  const [productCount, ratingStats, videoFeeds, reviewPreview] = await Promise.all([
    getVendorProductCount(vendor._id),
    getVendorRatingStats(vendor._id),
    fetchVendorVideoFeeds(vendor._id, baseUrl),
    fetchVendorReviewPreview(vendor._id, baseUrl),
  ]);

  const fullAddress = buildVendorFullAddress(vendor);
  const location = buildVendorLocation(vendor);
  const category =
    vendor.category && typeof vendor.category === "object"
      ? { _id: vendor.category._id, name: vendor.category.name }
      : vendor.category;

  const description = `${vendor.businessName} — shop on OHO E-BAZAR.`;

  return {
    _id: vendor._id,
    name: vendor.businessName,
    businessName: vendor.businessName,
    shopLogo: vendor.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl) : "",
    coverImage: vendor.shopBanner
      ? toAbsoluteUploadUrl(vendor.shopBanner, baseUrl)
      : vendor.shopLogo
        ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl)
        : "",
    location,
    fullAddress,
    address: fullAddress,
    city: vendor.city ?? "",
    state: vendor.state ?? "",
    country: vendor.country ?? "",
    pincode: vendor.pincode ?? "",
    email: vendor.email ?? "",
    ...resolveVendorContactPhone(vendor),
    description,
    about: description,
    category,
    rating: ratingStats.rating,
    ratingCount: ratingStats.ratingCount,
    reviewTotal: reviewPreview.total,
    productCount,
    videoFeeds,
    shopPhotos: (vendor.shopImages ?? []).map((image) => toAbsoluteUploadUrl(image, baseUrl)),
    shopVideos: (vendor.shopVideos ?? []).map((video) => toAbsoluteUploadUrl(video, baseUrl)),
    reviews: reviewPreview.reviews,
    joinedAt: vendor.createdAt,
  };
}

async function listVendorProducts(vendorId, baseUrl, { page = 1, limit = 20, skip = 0 } = {}) {
  await assertPublicVendor(vendorId);

  const filter = activePublicProductBaseFilter({ addedById: vendorId });

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name mode status")
      .populate("subCategory", "name status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const vendor = await Vendor.findById(vendorId)
    .select("businessName shopLogo")
    .lean();

  const ratingStatsMap = await getRatingStatsForProducts(products.map((product) => product._id));

  const items = products
    .map((product) => {
      const enriched = applyRatingStatsToProduct(product, ratingStatsMap);
      return toPublicProductListCard(enriched, vendor, baseUrl, { isWishlisted: false });
    })
    .filter(Boolean);

  return { items, total, page, limit };
}

module.exports = {
  buildPublicVendorProfile,
  listVendorProducts,
};
