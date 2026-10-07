const mongoose = require("mongoose");
const Category = require("../models/other/category");
const Product = require("../models/other/product");
const Wishlist = require("../models/other/wishlist");
const RecentView = require("../models/other/recentView");
const Vendor = require("../models/entity/vendor");
const { buildProductCards } = require("./publicProductCards");
const {
  activePublicProductBaseFilter,
  getCategoryIdsWithPublicProducts,
} = require("./publicProductList");
const { activePublicVendorFilter } = require("./publicVendorVisibility");
const { listHotDealProducts } = require("./hotDeals");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { getFeatureSettings } = require("./appFeatureSettings");

const MAX_RECENT_VIEWS = 30;

/** Higher-completeness vendors first, then newest. */
const RANKED_SORT = { vendorProfileScore: -1, createdAt: -1 };

function oid(value) {
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hot deals
// ---------------------------------------------------------------------------
async function loadHotDealCards(req, { limit } = {}) {
  const picked = await listHotDealProducts({ limit });
  const metaById = new Map(picked.map((row) => [String(row.product._id), row]));
  return buildProductCards(
    picked.map((row) => row.product),
    req,
    {
      decorate: (card, product) => {
        const meta = metaById.get(String(product._id));
        return {
          ...card,
          isHotDeal: true,
          discountPercent: meta?.percent ?? card.discountPercent ?? 0,
          hotDeal: {
            badge: meta?.rule?.badge || "Hot deal",
            ruleName: meta?.rule?.name || "",
            percentOff: meta?.percent ?? 0,
            endsAt: meta?.rule?.endsAt || null,
          },
        };
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Category-wise products
// ---------------------------------------------------------------------------
async function loadCategorySections(req, { baseUrl, perCategory = 8, maxCategories = 8, categoryId } = {}) {
  let categoryIds = await getCategoryIdsWithPublicProducts(Product, {
    categoryIds: categoryId ? [oid(categoryId)].filter(Boolean) : undefined,
  });
  if (!categoryIds.length) return [];

  const categories = await Category.find({ _id: { $in: categoryIds }, mode: "ecom", status: "active" })
    .select("name image")
    .sort({ createdAt: 1 })
    .limit(maxCategories)
    .lean();
  if (!categories.length) return [];

  const perCategoryDocs = await Promise.all(
    categories.map((category) =>
      Product.find(activePublicProductBaseFilter({ category: category._id }))
        .sort(RANKED_SORT)
        .limit(perCategory * 2) // over-fetch: cards of closed vendors are dropped
        .lean()
    )
  );

  const allProducts = perCategoryDocs.flat();
  const cards = await buildProductCards(allProducts, req, { baseUrl });
  const cardById = new Map(cards.map((card) => [String(card._id), card]));

  return categories
    .map((category, index) => {
      const items = perCategoryDocs[index]
        .map((product) => cardById.get(String(product._id)))
        .filter(Boolean)
        .slice(0, perCategory);
      return {
        category: {
          _id: category._id,
          name: category.name,
          image: toAbsoluteUploadUrl(category.image, baseUrl),
        },
        items,
        total: items.length,
      };
    })
    .filter((section) => section.items.length > 0);
}

// ---------------------------------------------------------------------------
// Recently viewed + suggestions
// ---------------------------------------------------------------------------
async function recordRecentView(userId, product) {
  if (!userId || !product?._id) return;
  await RecentView.updateOne(
    { user: userId, product: product._id },
    { $set: { viewedAt: new Date(), category: product.category?._id || product.category || null } },
    { upsert: true }
  );
  // keep only the newest N
  const stale = await RecentView.find({ user: userId })
    .sort({ viewedAt: -1 })
    .skip(MAX_RECENT_VIEWS)
    .select("_id")
    .lean();
  if (stale.length) await RecentView.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
}

async function listRecentlyViewed(req, { limit = 12, baseUrl } = {}) {
  if (!req.user?._id) return [];
  const views = await RecentView.find({ user: req.user._id })
    .sort({ viewedAt: -1 })
    .limit(limit * 2)
    .select("product")
    .lean();
  if (!views.length) return [];

  const ids = views.map((v) => v.product);
  const products = await Product.find(activePublicProductBaseFilter({ _id: { $in: ids } })).lean();
  const order = new Map(ids.map((id, i) => [String(id), i]));
  products.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  const cards = await buildProductCards(products, req, { baseUrl });
  return cards.slice(0, limit);
}

/**
 * "Suggested for you": products from categories the user wishlisted / viewed, minus what they
 * already saved or opened. Anonymous users (or users with no history) get popular products.
 */
async function loadSuggestions(req, { limit = 12, baseUrl } = {}) {
  const userId = req.user?._id;
  let seedCategoryIds = [];
  const excludeIds = new Set();

  if (userId) {
    const [wishlist, views] = await Promise.all([
      Wishlist.findOne({ user: userId }).select("products").lean(),
      RecentView.find({ user: userId }).sort({ viewedAt: -1 }).limit(MAX_RECENT_VIEWS).select("product category").lean(),
    ]);
    (wishlist?.products || []).forEach((id) => excludeIds.add(String(id)));
    views.forEach((v) => excludeIds.add(String(v.product)));

    const counts = new Map();
    views.forEach((v) => v.category && counts.set(String(v.category), (counts.get(String(v.category)) || 0) + 1));
    if (wishlist?.products?.length) {
      const wished = await Product.find({ _id: { $in: wishlist.products } }).select("category").lean();
      wished.forEach((p) => p.category && counts.set(String(p.category), (counts.get(String(p.category)) || 0) + 2));
    }
    seedCategoryIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => oid(id)).filter(Boolean);
  }

  const exclude = [...excludeIds].map(oid).filter(Boolean);
  const collected = [];
  const seen = new Set();
  const take = (docs) => {
    for (const doc of docs) {
      if (collected.length >= limit * 2) break;
      if (seen.has(String(doc._id))) continue;
      seen.add(String(doc._id));
      collected.push(doc);
    }
  };

  let personalised = false;
  if (seedCategoryIds.length) {
    const docs = await Product.find(
      activePublicProductBaseFilter({
        category: { $in: seedCategoryIds },
        ...(exclude.length ? { _id: { $nin: exclude } } : {}),
      })
    )
      .sort({ ratingCount: -1, ...RANKED_SORT })
      .limit(limit * 2)
      .lean();
    personalised = docs.length > 0;
    take(docs);
  }

  if (collected.length < limit) {
    const popular = await Product.find(
      activePublicProductBaseFilter({
        _id: { $nin: [...exclude, ...[...seen].map(oid).filter(Boolean)] },
      })
    )
      .sort({ ratingCount: -1, averageRating: -1, ...RANKED_SORT })
      .limit(limit * 2)
      .lean();
    take(popular);
  }

  const cards = await buildProductCards(collected, req, { baseUrl });
  return { items: cards.slice(0, limit), personalised };
}

// ---------------------------------------------------------------------------
// Vendor suggestions (user vendor list + home)
// ---------------------------------------------------------------------------
/**
 * Suggested vendors for the user app: Get Verified first, then best profile completion, same area boosted.
 */
async function loadSuggestedVendors(req, { limit = 6, baseUrl, city, subDistrict } = {}) {
  const { listGetVerifiedVendors } = require("./publicHome");
  const { toNearbyVendorCard, getVendorRatingStatsMap, getVendorProductStatsMap } = require("./nearbyVendors");

  const [verified, vendorIdsWithProducts] = await Promise.all([
    listGetVerifiedVendors({ ownerType: "ecom", baseUrl, limit: 50 }),
    Product.distinct("addedById", activePublicProductBaseFilter({ role: "Vendor" })),
  ]);
  if (!vendorIdsWithProducts.length) return [];
  const verifiedIds = new Set(verified.map((v) => String(v._id)));

  const vendors = await Vendor.find(activePublicVendorFilter({ _id: { $in: vendorIdsWithProducts } }))
    .populate("category", "name mode status")
    .sort({ profileScore: -1, createdAt: -1 })
    .limit(Math.max(limit * 4, 24))
    .lean();

  const sameArea = (vendor) => {
    const eq = (a, b) => a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    if (subDistrict && eq(vendor.subDistrict, subDistrict)) return 2;
    if (city && eq(vendor.city, city)) return 1;
    return 0;
  };

  const ranked = vendors
    .map((vendor) => ({
      vendor,
      score:
        (verifiedIds.has(String(vendor._id)) ? 100 : 0) +
        sameArea(vendor) * 20 +
        (Number(vendor.profileScore) || 0) / 5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const ids = ranked.map((r) => r.vendor._id);
  const [productStats, ratingStats] = await Promise.all([
    getVendorProductStatsMap(ids),
    getVendorRatingStatsMap(ids),
  ]);

  return ranked
    .map(({ vendor }) => ({
      ...toNearbyVendorCard(vendor, baseUrl, productStats.get(String(vendor._id)) ?? {}, ratingStats.get(String(vendor._id)) ?? {}),
      isVerified: verifiedIds.has(String(vendor._id)),
      profileScore: Number(vendor.profileScore) || 0,
      isSuggested: true,
    }))
    .filter((card) => card.productCount > 0);
}

// ---------------------------------------------------------------------------
// Vendor-aware search
// ---------------------------------------------------------------------------
/** Case-insensitive "all words" regex clause so "shiv shakti" matches "Shiv Shakti Store". */
function nameTokenClause(field, search) {
  const tokens = String(search || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!tokens.length) return null;
  return { $and: tokens.map((t) => ({ [field]: { $regex: t, $options: "i" } })) };
}

/** Ecom vendors (public, open) whose shop name matches the search text. */
async function findVendorsMatchingSearch(search, { limit = 10 } = {}) {
  const clause = nameTokenClause("businessName", search);
  if (!clause) return [];
  return Vendor.find(activePublicVendorFilter(clause))
    .select("businessName shopLogo city state subDistrict profileScore")
    .sort({ profileScore: -1 })
    .limit(limit)
    .lean();
}

async function loadHomeSectionOrder() {
  const features = await getFeatureSettings();
  return (features.homeSections || []).filter((s) => s.enabled !== false);
}

module.exports = {
  RANKED_SORT,
  loadHotDealCards,
  loadCategorySections,
  recordRecentView,
  listRecentlyViewed,
  loadSuggestions,
  loadSuggestedVendors,
  findVendorsMatchingSearch,
  nameTokenClause,
  loadHomeSectionOrder,
};
