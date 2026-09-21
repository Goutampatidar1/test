const Banner = require("../models/other/banner");
const Category = require("../models/other/category");
const Product = require("../models/other/product");
const Vendor = require("../models/entity/vendor");
const { toPublicBanner } = require("./mobilePresenters");
const { listActiveVendorSubscriptionBanners } = require("./vendorPlanSubscription");
const { listPromotionalBannersForHome } = require("./promotionEngine");
const { toAbsoluteUploadUrl } = require("./mediaUrl");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function startOfUtcDay(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function activeBannerFilter(city, targetType = "ecom") {
  const now = new Date();
  const normalizedCity = String(city ?? "").trim();
  const normalizedTarget = String(targetType ?? "ecom").trim().toLowerCase();
  const targetFilter =
    normalizedTarget === "venue"
      ? { targetType: "venue" }
      : normalizedTarget === "user"
        ? { targetType: "user" }
        : { $or: [{ targetType: "ecom" }, { targetType: { $exists: false } }] };

  const visibilityCondition = normalizedCity
    ? {
        $or: [
          { mode: "global" },
          {
            mode: "city",
            cities: new RegExp(`^${escapeRegex(normalizedCity)}$`, "i"),
          },
        ],
      }
    : { mode: "global" };

  return {
    status: "active",
    ...targetFilter,
    $and: [
      {
        $or: [
          { startDate: { $exists: false } },
          { startDate: null },
          { startDate: { $lte: now } },
        ],
      },
      {
        $or: [
          { endDate: { $exists: false } },
          { endDate: null },
          { endDate: { $gte: startOfUtcDay(now) } },
        ],
      },
      visibilityCondition,
    ],
  };
}

function resolveRequestCity(req) {
  const fromQuery = req.query?.city;
  const fromHeader = req.headers["x-city"] ?? req.headers["x-user-city"];
  return String(fromQuery ?? fromHeader ?? "").trim();
}

async function resolveRelatedEntities(banners, baseUrl = "") {
  const categoryIds = [];
  const productIds = [];
  const vendorIds = [];

  for (const banner of banners) {
    const related = String(banner.related || "none").toLowerCase();
    if (related === "category" && banner.category) {
      categoryIds.push(banner.category._id || banner.category);
    } else if (related === "product" && banner.relatedId) {
      productIds.push(banner.relatedId);
    } else if (related === "vendor" && banner.relatedId) {
      vendorIds.push(banner.relatedId);
    }
  }

  const [categories, products, vendors] = await Promise.all([
    categoryIds.length
      ? Category.find({ _id: { $in: categoryIds } }).select("_id name image mode").lean()
      : [],
    productIds.length
      ? Product.find({ _id: { $in: productIds } }).select("_id name thumbnail images").lean()
      : [],
    vendorIds.length
      ? Vendor.find({ _id: { $in: vendorIds } }).select("_id name businessName shopLogo").lean()
      : [],
  ]);

  const categoryMap = new Map(categories.map((item) => [String(item._id), item]));
  const productMap = new Map(products.map((item) => [String(item._id), item]));
  const vendorMap = new Map(vendors.map((item) => [String(item._id), item]));

  return banners.map((banner) => {
    const related = String(banner.related || "none").toLowerCase();
    let relatedEntity = null;

    if (related === "category") {
      const categoryId = banner.category?._id || banner.category;
      const category = categoryId ? categoryMap.get(String(categoryId)) : null;
      if (category) {
        relatedEntity = {
          _id: category._id,
          name: category.name,
          image: toAbsoluteUploadUrl(category.image, baseUrl),
          mode: category.mode,
        };
      }
    } else if (related === "product") {
      const product = banner.relatedId ? productMap.get(String(banner.relatedId)) : null;
      if (product) {
        const thumb = product.thumbnail || (Array.isArray(product.images) ? product.images[0] : null);
        relatedEntity = {
          _id: product._id,
          name: product.name,
          image: toAbsoluteUploadUrl(thumb, baseUrl),
        };
      }
    } else if (related === "vendor") {
      const vendor = banner.relatedId ? vendorMap.get(String(banner.relatedId)) : null;
      if (vendor) {
        relatedEntity = {
          _id: vendor._id,
          name: vendor.businessName || vendor.name,
          image: toAbsoluteUploadUrl(vendor.shopLogo, baseUrl),
        };
      }
    }

    return toPublicBanner(banner, baseUrl, relatedEntity);
  });
}

async function listActiveBanners({ city = "", targetType = "ecom", baseUrl = "" } = {}) {
  const normalizedTarget = String(targetType ?? "ecom").trim().toLowerCase();
  const adminBanners = await Banner.find(activeBannerFilter(city, normalizedTarget))
    .populate("category", "name image mode status")
    .sort({ createdAt: -1 })
    .lean();
  const fromAdmin = (await resolveRelatedEntities(adminBanners, baseUrl)).filter(Boolean);

  // Vendor plan banners are only for ecom / venue panels, not the consumer user app
  if (normalizedTarget === "user") {
    return fromAdmin;
  }

  const vendorBanners = await listActiveVendorSubscriptionBanners({
    targetType: normalizedTarget,
    baseUrl,
  });
  const promotionBanners = await listPromotionalBannersForHome({
    city,
    targetType: normalizedTarget,
    baseUrl,
  });
  return [...promotionBanners, ...vendorBanners, ...fromAdmin];
}

module.exports = {
  activeBannerFilter,
  listActiveBanners,
  resolveRequestCity,
};
