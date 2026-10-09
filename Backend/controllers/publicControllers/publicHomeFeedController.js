const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const { listActiveBanners, resolveRequestCity } = require("../../utils/bannerQuery");
const { resolveNearbyLocation } = require("../../utils/nearbyVendors");
const {
  loadHotDealCards,
  loadCategorySections,
  loadSuggestions,
  loadSuggestedVendors,
} = require("../../utils/homeFeed");
const { loadVideoPage } = require("./publicVideoFeedController");

async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[home-feed] ${label} failed: ${err.message}`);
    return fallback;
  }
}

/**
 * GET /api/public/home/feed — the user-app home screen in one call.
 *
 * Sections come back in the admin-configured order (feature_settings.homeSections) and disabled
 * sections are omitted. Keys: banners, categories, video, hotDeals, products, suggestions.
 *
 * Query: city, subDistrictId / subDistrict (falls back to the signed-in user's saved area),
 *        perCategory (default 8), maxCategories (default 8), videoLimit (default 6)
 */
exports.getHomeFeed = asyncHandler(async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const features = await getFeatureSettings();
  const videoAllowed = features.videoEnabledUser !== false;
  const order = (features.homeSections || []).filter(
    (s) => s.enabled !== false && (s.key !== "video" || videoAllowed)
  );
  const wants = new Set(order.map((s) => s.key));

  const area = await safe(
    "area",
    () => resolveNearbyLocation(req.user?._id ?? null, req.query, { locationOptional: true }),
    { city: null, subDistrict: null, subDistrictId: null }
  );
  const city = area.city || resolveRequestCity(req) || "";
  const areaPayload = {
    city: area.city || "",
    subDistrict: area.subDistrict || "",
    subDistrictId: area.subDistrictId || null,
    label: [area.subDistrict, area.city].filter(Boolean).join(", "),
    isSet: Boolean(area.city || area.subDistrict),
  };

  const perCategory = Math.min(Math.max(parseInt(req.query.perCategory, 10) || 8, 1), 20);
  const maxCategories = Math.min(Math.max(parseInt(req.query.maxCategories, 10) || 8, 1), 20);
  const videoLimit = Math.min(Math.max(parseInt(req.query.videoLimit, 10) || 6, 1), 20);

  const needCategories = wants.has("categories") || wants.has("products");

  const [banners, categorySections, video, hotDeals, suggestionData, suggestedVendors] = await Promise.all([
    wants.has("banners")
      ? safe("banners", () => listActiveBanners({ city, targetType: "user", baseUrl }), [])
      : [],
    needCategories
      ? safe("categories", () => loadCategorySections(req, { baseUrl, perCategory, maxCategories }), [])
      : [],
    wants.has("video")
      ? safe("video", () => loadVideoPage({ feedType: "all", limit: videoLimit, lite: true, baseUrl, userId: req.user?._id }), {
          items: [],
          hasMore: false,
          nextCursor: null,
        })
      : { items: [], hasMore: false, nextCursor: null },
    wants.has("hotDeals") && features.hotDealsEnabled !== false
      ? safe("hotDeals", () => loadHotDealCards(req, { limit: features.hotDealsLimit }), [])
      : [],
    wants.has("suggestions")
      ? safe("suggestions", () => loadSuggestions(req, { limit: 12, baseUrl }), { items: [], personalised: false })
      : { items: [], personalised: false },
    wants.has("suggestions")
      ? safe(
          "suggestedVendors",
          () => loadSuggestedVendors(req, { limit: 6, baseUrl, city: area.city, subDistrict: area.subDistrict }),
          []
        )
      : [],
  ]);

  const builders = {
    banners: () => ({ items: banners }),
    categories: () => ({ items: categorySections.map((s) => s.category) }),
    video: () => ({
      enabled: true,
      items: video.items,
      hasMore: video.hasMore,
      nextCursor: video.nextCursor,
      endpoint: "/api/public/video-feeds",
    }),
    hotDeals: () => ({ enabled: features.hotDealsEnabled !== false, items: hotDeals }),
    products: () => ({ groups: categorySections }),
    suggestions: () => ({
      items: suggestionData.items,
      personalised: suggestionData.personalised,
      vendors: suggestedVendors,
    }),
  };

  const sections = order
    .filter((s) => builders[s.key])
    .map((s) => ({ key: s.key, title: s.title, ...builders[s.key]() }));

  sendSuccess(res, "Home feed fetched", {
    area: areaPayload,
    order: order.map((s) => s.key),
    sections,
  });
});
