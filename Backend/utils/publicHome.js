const mongoose = require("mongoose");
const Vendor = require("../models/entity/vendor");
const VenueVendor = require("../models/entity/venueVendor");
const Product = require("../models/other/product");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { listActiveBanners } = require("./bannerQuery");
const { listActiveSubscriptionsByPlanType } = require("./vendorPlanSubscription");
const {
  activePublicProductBaseFilter,
  toPublicProductListCard,
} = require("./publicProductList");
const { activePublicVendorFilter } = require("./publicVendorVisibility");
const { getVendorRatingStatsMap } = require("./nearbyVendors");

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function toObjectIds(ids) {
  return (ids || [])
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function toVerifiedVendorCard(vendor, baseUrl, ownerType = "ecom", ratingStats = {}) {
  if (!vendor) return null;
  const logoPath = vendor.shopLogo || vendor.profileImage || "";
  const overallRating = ratingStats.rating ?? 0;
  return {
    _id: vendor._id,
    vendorId: vendor._id,
    name: vendor.businessName || vendor.name || "",
    businessName: vendor.businessName || vendor.name || "",
    description: vendor.shopDescription || vendor.businessDescription || "",
    shopDescription: vendor.shopDescription || vendor.businessDescription || "",
    shopLogo: logoPath ? toAbsoluteUploadUrl(logoPath, baseUrl) : "",
    profileImage: vendor.profileImage ? toAbsoluteUploadUrl(vendor.profileImage, baseUrl) : "",
    city: vendor.city || "",
    state: vendor.state || "",
    subDistrict: vendor.subDistrict || "",
    overallRating,
    rating: overallRating || null,
    averageRating: overallRating,
    ratingCount: ratingStats.ratingCount ?? 0,
    ownerType,
    isVerified: true,
    verifiedLabel: "Get Verified",
    planType: "get_verified",
  };
}

/** Vendors with active Get Verified plan (ecom or venue). */
async function listGetVerifiedVendors({ ownerType = "ecom", baseUrl = "", limit = 50 } = {}) {
  const max = Math.max(1, Math.min(Number(limit) || 50, 100));
  const subs = await listActiveSubscriptionsByPlanType({
    ownerType,
    planType: "get_verified",
  });
  if (!subs.length) return [];

  const ownerIds = toObjectIds(subs.map((s) => s.owner));
  if (!ownerIds.length) return [];

  const Model = ownerType === "venue" ? VenueVendor : Vendor;
  const selectFields =
    ownerType === "venue"
      ? "name businessName businessDescription profileImage status approvalStatus isOpen"
      : "name businessName shopDescription shopLogo profileImage city state subDistrict status approvalStatus isOpen";

  const vendors = await Model.find({
    ...activePublicVendorFilter(),
    _id: { $in: ownerIds },
  })
    .select(selectFields)
    .lean();

  const byId = new Map(vendors.map((v) => [String(v._id), v]));
  const ratingByVendor =
    ownerType === "venue" ? new Map() : await getVendorRatingStatsMap(vendors.map((v) => v._id));
  const ordered = [];
  for (const sub of subs) {
    const vendor = byId.get(String(sub.owner));
    const card = toVerifiedVendorCard(vendor, baseUrl, ownerType, ratingByVendor.get(String(sub.owner)) || {});
    if (card) ordered.push(card);
    if (ordered.length >= max) break;
  }
  return ordered;
}

/**
 * Product Presence First plan:
 * - exactly ONE public product per subscribed ecom vendor
 * - prefers vendor-selected featuredProductId; else random product
 * - capped by plan presenceTopLimit
 */
async function listPresenceProducts({ baseUrl = "", limit } = {}) {
  const subs = await listActiveSubscriptionsByPlanType({
    ownerType: "ecom",
    planType: "product_presence_first",
  });
  if (!subs.length) return [];

  const limits = subs.map((s) => Number(s.presenceTopLimit) || 100);
  const topLimit = Math.max(1, ...(limits.length ? limits : [100]));
  const requested = limit == null || Number.isNaN(Number(limit)) ? topLimit : Number(limit);
  const effectiveLimit = Math.max(1, Math.min(topLimit, requested, 100));

  const openVendors = await Vendor.find({
    ...activePublicVendorFilter(),
    _id: { $in: toObjectIds(subs.map((s) => s.owner)) },
  })
    .select("_id businessName shopLogo")
    .lean();
  const vendorMap = new Map(openVendors.map((v) => [String(v._id), v]));

  let activeSubs = subs.filter((s) => vendorMap.has(String(s.owner)));
  if (!activeSubs.length) return [];

  shuffleInPlace(activeSubs);
  activeSubs = activeSubs.slice(0, effectiveLimit);

  const featuredIds = toObjectIds(activeSubs.map((s) => s.featuredProductId).filter(Boolean));
  const featuredProducts = featuredIds.length
    ? await Product.find(
        activePublicProductBaseFilter({
          role: "Vendor",
          _id: { $in: featuredIds },
        })
      ).lean()
    : [];
  const featuredById = new Map(featuredProducts.map((p) => [String(p._id), p]));

  const needRandomVendorIds = toObjectIds(
    activeSubs
      .filter((s) => {
        if (!s.featuredProductId) return true;
        const product = featuredById.get(String(s.featuredProductId));
        return !product || String(product.addedById) !== String(s.owner);
      })
      .map((s) => s.owner)
  );

  let randomByVendor = new Map();
  if (needRandomVendorIds.length) {
    const rows = await Product.aggregate([
      {
        $match: activePublicProductBaseFilter({
          role: "Vendor",
          addedById: { $in: needRandomVendorIds },
        }),
      },
      { $addFields: { _rand: { $rand: {} } } },
      { $sort: { _rand: 1 } },
      {
        $group: {
          _id: "$addedById",
          product: { $first: "$$ROOT" },
        },
      },
    ]);
    randomByVendor = new Map(rows.map((row) => [String(row._id), row.product]));
  }

  const cards = [];
  for (const sub of activeSubs) {
    const vendorId = String(sub.owner);
    let product = null;
    if (sub.featuredProductId) {
      const featured = featuredById.get(String(sub.featuredProductId));
      if (featured && String(featured.addedById) === vendorId) {
        product = featured;
      }
    }
    if (!product) {
      product = randomByVendor.get(vendorId) || null;
    }
    if (!product) continue;

    const card = toPublicProductListCard(product, vendorMap.get(vendorId), baseUrl, {
      isWishlisted: false,
    });
    if (card) {
      card.presenceBoosted = true;
      card.presenceLabel = "Product Presence First";
      card.planType = "product_presence_first";
      card.featured = Boolean(sub.featuredProductId && String(sub.featuredProductId) === String(product._id));
      cards.push(card);
    }
  }

  return shuffleInPlace(cards);
}

async function buildPublicHome({
  city = "",
  targetType = "ecom",
  baseUrl = "",
  verifiedLimit = 50,
  presenceLimit,
} = {}) {
  const rawTarget = String(targetType ?? "ecom").trim().toLowerCase();
  const normalizedTarget =
    rawTarget === "venue" ? "venue" : rawTarget === "user" ? "user" : "ecom";
  const ownerType = normalizedTarget === "venue" ? "venue" : "ecom";

  const [banners, verifiedVendors, presenceProducts] = await Promise.all([
    listActiveBanners({ city, targetType: normalizedTarget, baseUrl }),
    listGetVerifiedVendors({
      ownerType,
      baseUrl,
      limit: verifiedLimit,
    }),
    ownerType === "ecom"
      ? listPresenceProducts({ baseUrl, limit: presenceLimit })
      : Promise.resolve([]),
  ]);

  return {
    type: normalizedTarget,
    city: city || "",
    banners,
    /** Get Verified plan vendors */
    getVerified: verifiedVendors,
    verifiedVendors,
    /** Product Presence First — 1 product per subscribed vendor */
    productListing: presenceProducts,
    presenceProducts,
    productPresenceFirst: presenceProducts,
    sections: {
      banners: {
        title: "Banners",
        planType: "banner",
        items: banners,
      },
      getVerified: {
        title: "Get Verified",
        planType: "get_verified",
        items: verifiedVendors,
      },
      productListing: {
        title: "Product Presence First",
        planType: "product_presence_first",
        note: "One product per subscribed vendor",
        items: presenceProducts,
      },
    },
  };
}

module.exports = {
  buildPublicHome,
  listGetVerifiedVendors,
  listPresenceProducts,
};
