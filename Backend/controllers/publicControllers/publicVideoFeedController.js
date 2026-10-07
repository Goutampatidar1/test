const Product = require("../../models/other/product");
const ProductVideoFeed = require("../../models/other/productVideoFeed");
const VenueVideoFeed = require("../../models/other/venueVideoFeed");
const Vendor = require("../../models/entity/vendor");
const VenueVendor = require("../../models/entity/venueVendor");
const Venue = require("../../models/other/venue");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const { toPublicVideoFeedItem } = require("../../utils/productVideoFeed");
const { getLikeMetaForFeeds } = require("../../utils/productVideoFeedLike");
const { toPublicVenueVideoFeedItem } = require("../../utils/venueVideoFeed");
const { getVenueLikeMetaForFeeds } = require("../../utils/venueVideoFeedLike");

function normalizeFeedType(raw) {
  const value = String(raw ?? "all").trim().toLowerCase();
  if (!value || value === "all") return "all";
  if (value === "ecom" || value === "product" || value === "products") return "ecom";
  if (value === "venue" || value === "venues" || value === "service" || value === "services") {
    return "venue";
  }
  throw new AppError("Invalid type filter. Use all, ecom, or venue", 400);
}

async function hydratePublicEcomFeeds(feeds, baseUrl, userId = null, { lite = false } = {}) {
  const productIds = [
    ...new Set(feeds.map((f) => f.product).filter(Boolean).map((id) => String(id))),
  ];
  const vendorIds = [...new Set(feeds.map((f) => String(f.vendor)))];

  const [products, vendors] = await Promise.all([
    Product.find({
      _id: { $in: productIds },
      status: "active",
    }).lean(),
    Vendor.find({
      _id: { $in: vendorIds },
      status: "active",
      approvalStatus: "approved",
      isOpen: { $ne: false },
      videoEnabled: { $ne: false },
    })
      .select("businessName shopLogo city state")
      .lean(),
  ]);

  const productCounts = vendors.length && !lite
    ? await Product.aggregate([
        {
          $match: {
            addedById: { $in: vendors.map((v) => v._id) },
            role: "Vendor",
            status: "active",
          },
        },
        { $group: { _id: "$addedById", count: { $sum: 1 } } },
      ])
    : [];

  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));
  const countMap = new Map(productCounts.map((row) => [String(row._id), row.count]));

  const feedIds = feeds.map((feed) => feed._id);
  const { countMap: likeCountMap, likedSet } = await getLikeMetaForFeeds(feedIds, userId);

  return feeds
    .map((feed) => {
      try {
        const vendor = vendorMap.get(String(feed.vendor));
        if (!vendor) return null;

        const product = feed.product ? productMap.get(String(feed.product)) : null;
        if (feed.product && !product) return null;

        return toPublicVideoFeedItem(feed, product, vendor, baseUrl, {
          productCount: countMap.get(String(feed.vendor)) ?? 0,
          likeCount: likeCountMap.get(String(feed._id)) ?? 0,
          isLiked: likedSet.has(String(feed._id)),
        });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function hydratePublicVenueFeeds(feeds, baseUrl, userId = null, { lite = false } = {}) {
  const venueIds = [
    ...new Set(feeds.map((f) => f.venue).filter(Boolean).map((id) => String(id))),
  ];
  const venueVendorIds = [...new Set(feeds.map((f) => String(f.venueVendor)))];

  const [venues, venueVendors] = await Promise.all([
    Venue.find({
      _id: { $in: venueIds },
      status: "active",
      adminApproved: true,
    }).lean(),
    VenueVendor.find({
      _id: { $in: venueVendorIds },
      status: "active",
      approvalStatus: "approved",
      isOpen: { $ne: false },
      videoEnabled: { $ne: false },
    })
      .select("name businessName profileImage businessAddress")
      .lean(),
  ]);

  const venueCounts = venueVendors.length && !lite
    ? await Venue.aggregate([
        {
          $match: {
            addedById: { $in: venueVendors.map((v) => v._id) },
            role: "VenueVendor",
            status: "active",
            adminApproved: true,
          },
        },
        { $group: { _id: "$addedById", count: { $sum: 1 } } },
      ])
    : [];

  const venueMap = new Map(venues.map((v) => [String(v._id), v]));
  const vendorMap = new Map(venueVendors.map((v) => [String(v._id), v]));
  const countMap = new Map(venueCounts.map((row) => [String(row._id), row.count]));

  const feedIds = feeds.map((feed) => feed._id);
  const { countMap: likeCountMap, likedSet } = await getVenueLikeMetaForFeeds(feedIds, userId);

  return feeds
    .map((feed) => {
      try {
        const venueVendor = vendorMap.get(String(feed.venueVendor));
        if (!venueVendor) return null;

        const venue = feed.venue ? venueMap.get(String(feed.venue)) : null;
        if (feed.venue && !venue) return null;

        return toPublicVenueVideoFeedItem(feed, venue, venueVendor, baseUrl, {
          venueCount: countMap.get(String(feed.venueVendor)) ?? 0,
          likeCount: likeCountMap.get(String(feed._id)) ?? 0,
          isLiked: likedSet.has(String(feed._id)),
        });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** User app — video section (reels). Query: type=all|ecom|venue */
async function listVideoFeedsOffset(req, res) {
  const { page, limit, skip } = getPagination(req.query);
  const baseUrl = getPublicBaseUrl(req);
  const feedType = normalizeFeedType(req.query.type ?? req.query.feedType ?? req.query.kind);

  const productId = req.query.product ?? req.query.productId;
  const venueId = req.query.venue ?? req.query.venueId;
  if (productId) assertObjectId(productId, "Invalid product id");
  if (venueId) assertObjectId(venueId, "Invalid venue id");

  const ecomFilter = { status: "active" };
  if (productId) ecomFilter.product = productId;

  const venueFilter = { status: "active" };
  if (venueId) venueFilter.venue = venueId;

  const includeEcom = feedType === "all" || feedType === "ecom";
  const includeVenue = feedType === "all" || feedType === "venue";

  if (feedType !== "all") {
    if (feedType === "ecom") {
      const [feeds, total] = await Promise.all([
        ProductVideoFeed.find(ecomFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        ProductVideoFeed.countDocuments(ecomFilter),
      ]);
      const items = await hydratePublicEcomFeeds(feeds, baseUrl, req.user?._id);
      return res.status(200).json({
        status: items.length > 0,
        message: productId ? "Product video feeds fetched" : "Ecom video feeds fetched",
        data: items,
        filter: { type: feedType },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      });
    }

    const [feeds, total] = await Promise.all([
      VenueVideoFeed.find(venueFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VenueVideoFeed.countDocuments(venueFilter),
    ]);
    const items = await hydratePublicVenueFeeds(feeds, baseUrl, req.user?._id);
    return res.status(200).json({
      status: items.length > 0,
      message: venueId ? "Service video feeds fetched" : "Venue video feeds fetched",
      data: items,
      filter: { type: feedType },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  }

  const fetchLimit = skip + limit;
  const [ecomFeeds, venueFeeds, ecomTotal, venueTotal] = await Promise.all([
    includeEcom
      ? ProductVideoFeed.find(ecomFilter).sort({ createdAt: -1 }).limit(fetchLimit).lean()
      : Promise.resolve([]),
    includeVenue
      ? VenueVideoFeed.find(venueFilter).sort({ createdAt: -1 }).limit(fetchLimit).lean()
      : Promise.resolve([]),
    includeEcom ? ProductVideoFeed.countDocuments(ecomFilter) : Promise.resolve(0),
    includeVenue ? VenueVideoFeed.countDocuments(venueFilter) : Promise.resolve(0),
  ]);

  const [ecomItems, venueItems] = await Promise.all([
    hydratePublicEcomFeeds(ecomFeeds, baseUrl, req.user?._id),
    hydratePublicVenueFeeds(venueFeeds, baseUrl, req.user?._id),
  ]);

  const merged = [...ecomItems, ...venueItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const items = merged.slice(skip, skip + limit);
  const total = ecomTotal + venueTotal;

  return res.status(200).json({
    status: items.length > 0,
    message: "Video feeds fetched",
    data: items,
    filter: { type: "all" },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
}

// ---------------------------------------------------------------------------
// Cursor pagination (default). Small pages, short-lived cache, optional lite payload.
// ---------------------------------------------------------------------------
const FEED_CACHE_TTL_MS = 30 * 1000;
const FEED_CACHE_MAX = 200;
const feedCache = new Map();

function readFeedCache(key) {
  const hit = feedCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    feedCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeFeedCache(key, value) {
  if (feedCache.size >= FEED_CACHE_MAX) {
    feedCache.delete(feedCache.keys().next().value);
  }
  feedCache.set(key, { value, expires: Date.now() + FEED_CACHE_TTL_MS });
}

function encodeCursor(feed) {
  return Buffer.from(`${new Date(feed.createdAt).getTime()}_${feed._id}`).toString("base64url");
}

function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const [ms, id] = Buffer.from(String(raw), "base64url").toString("utf8").split("_");
    const date = new Date(Number(ms));
    if (Number.isNaN(date.getTime()) || !id) return null;
    assertObjectId(id, "Invalid cursor");
    return { date, id };
  } catch {
    throw new AppError("Invalid cursor", 400);
  }
}

function withCursor(filter, cursor) {
  if (!cursor) return filter;
  return {
    ...filter,
    $or: [
      { createdAt: { $lt: cursor.date } },
      { createdAt: cursor.date, _id: { $lt: cursor.id } },
    ],
  };
}

const LITE_VIDEO_FIELDS = ["_id", "type", "video", "thumbnail", "title", "likeCount", "isLiked", "product", "venue", "shopNow", "bookNow", "createdAt"];

function toLiteItem(item) {
  const lite = {};
  for (const key of LITE_VIDEO_FIELDS) lite[key] = item[key];
  lite.vendor = item.vendor ? { _id: item.vendor._id, name: item.vendor.name, profileImage: item.vendor.profileImage } : null;
  return lite;
}

/**
 * User app — video section (reels).
 * Query: type=all|ecom|venue, limit (default 6, max 20), cursor (from previous `nextCursor`), lite=1.
 * Legacy `page=` requests keep the old offset behaviour.
 */
exports.listVideoFeeds = asyncHandler(async (req, res) => {
  if (req.query.page !== undefined) {
    return listVideoFeedsOffset(req, res);
  }

  const features = await getFeatureSettings();
  const userEnabled = features.videoEnabledUser !== false && req.user?.videoEnabled !== false;
  const empty = (message) =>
    res.status(200).json({
      status: false,
      message,
      data: [],
      videoEnabled: false,
      pagination: { limit: 0, hasMore: false, nextCursor: null },
    });
  if (features.videoEnabledUser === false) return empty("Videos are currently disabled");
  if (!userEnabled) return empty("Videos are turned off in your settings");

  const baseUrl = getPublicBaseUrl(req);
  const feedType = normalizeFeedType(req.query.type ?? req.query.feedType ?? req.query.kind);
  const lite = ["1", "true", "yes"].includes(String(req.query.lite ?? "").toLowerCase());
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 20);

  const productId = req.query.product ?? req.query.productId;
  const venueId = req.query.venue ?? req.query.venueId;
  if (productId) assertObjectId(productId, "Invalid product id");
  if (venueId) assertObjectId(venueId, "Invalid venue id");

  const page = await loadVideoPage({
    feedType,
    limit,
    lite,
    cursorRaw: req.query.cursor,
    productId,
    venueId,
    baseUrl,
    userId: req.user?._id,
  });
  const items = page.items;

  if (!req.user) res.set("Cache-Control", "public, max-age=15");
  return res.status(200).json({
    status: items.length > 0,
    message: "Video feeds fetched",
    data: items,
    videoEnabled: true,
    filter: { type: feedType },
    pagination: { limit, hasMore: page.hasMore, nextCursor: page.nextCursor },
  });
});

/** One cursor page of videos (cached, user "liked" flags layered on top). Reused by the home feed. */
async function loadVideoPage({ feedType = "all", limit = 6, lite = false, cursorRaw, productId, venueId, baseUrl, userId }) {
  const cursor = decodeCursor(cursorRaw);
  const cacheKey = [feedType, limit, lite ? 1 : 0, cursorRaw || "", productId || "", venueId || ""].join("|");
  let page = readFeedCache(cacheKey);

  if (!page) {
    const ecomFilter = withCursor({ status: "active", ...(productId ? { product: productId } : {}) }, cursor);
    const venueFilter = withCursor({ status: "active", ...(venueId ? { venue: venueId } : {}) }, cursor);
    const includeEcom = feedType !== "venue" && !venueId;
    const includeVenue = feedType !== "ecom" && !productId;
    const sortSpec = { createdAt: -1, _id: -1 };

    const [ecomRaw, venueRaw] = await Promise.all([
      includeEcom
        ? ProductVideoFeed.find(ecomFilter).sort(sortSpec).limit(limit + 1).lean()
        : Promise.resolve([]),
      includeVenue
        ? VenueVideoFeed.find(venueFilter).sort(sortSpec).limit(limit + 1).lean()
        : Promise.resolve([]),
    ]);

    const merged = [
      ...ecomRaw.map((feed) => ({ kind: "ecom", feed })),
      ...venueRaw.map((feed) => ({ kind: "venue", feed })),
    ].sort((a, b) => {
      const diff = new Date(b.feed.createdAt).getTime() - new Date(a.feed.createdAt).getTime();
      return diff || String(b.feed._id).localeCompare(String(a.feed._id));
    });

    const hasMore = merged.length > limit;
    const slice = merged.slice(0, limit);
    const nextCursor = hasMore && slice.length ? encodeCursor(slice[slice.length - 1].feed) : null;

    const [ecomItems, venueItems] = await Promise.all([
      hydratePublicEcomFeeds(slice.filter((r) => r.kind === "ecom").map((r) => r.feed), baseUrl, null, { lite }),
      hydratePublicVenueFeeds(slice.filter((r) => r.kind === "venue").map((r) => r.feed), baseUrl, null, { lite }),
    ]);
    const byId = new Map([...ecomItems, ...venueItems].map((item) => [String(item._id), item]));
    const items = slice.map((r) => byId.get(String(r.feed._id))).filter(Boolean);

    page = { items: lite ? items.map(toLiteItem) : items, hasMore, nextCursor };
    writeFeedCache(cacheKey, page);
  }

  // per-user liked flags are layered on top of the shared cached page
  let items = page.items;
  if (userId && items.length) {
    const ecomIds = items.filter((i) => i.type !== "venue").map((i) => i._id);
    const venueIds = items.filter((i) => i.type === "venue").map((i) => i._id);
    const [ecomMeta, venueMeta] = await Promise.all([
      ecomIds.length ? getLikeMetaForFeeds(ecomIds, userId) : { likedSet: new Set() },
      venueIds.length ? getVenueLikeMetaForFeeds(venueIds, userId) : { likedSet: new Set() },
    ]);
    items = items.map((item) => ({
      ...item,
      isLiked: (item.type === "venue" ? venueMeta : ecomMeta).likedSet.has(String(item._id)),
    }));
  }

  return { items, hasMore: page.hasMore, nextCursor: page.nextCursor };
}
exports.loadVideoPage = loadVideoPage;

/** User app — single video by feed id (ecom or venue), or all ecom videos for a product id */
exports.getVideoFeedById = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId ?? req.params.id;
  assertObjectId(feedId, "Invalid video feed id");

  const baseUrl = getPublicBaseUrl(req);

  const ecomFeed = await ProductVideoFeed.findOne({
    _id: feedId,
    status: "active",
  }).lean();

  if (ecomFeed) {
    const [item] = await hydratePublicEcomFeeds([ecomFeed], baseUrl, req.user?._id);
    if (!item) {
      throw new AppError(
        "Video is not available. Product must be active and vendor must be approved.",
        404
      );
    }

    return res.status(200).json({
      status: true,
      message: "Video feed fetched",
      data: [item],
    });
  }

  const venueFeed = await VenueVideoFeed.findOne({
    _id: feedId,
    status: "active",
  }).lean();

  if (venueFeed) {
    const [item] = await hydratePublicVenueFeeds([venueFeed], baseUrl, req.user?._id);
    if (!item) {
      throw new AppError(
        "Video is not available. Service must be active and service vendor must be approved.",
        404
      );
    }

    return res.status(200).json({
      status: true,
      message: "Video feed fetched",
      data: [item],
    });
  }

  const productFeeds = await ProductVideoFeed.find({
    product: feedId,
    status: "active",
  })
    .sort({ createdAt: -1 })
    .lean();

  if (productFeeds.length) {
    const items = await hydratePublicEcomFeeds(productFeeds, baseUrl, req.user?._id);
    if (!items.length) {
      throw new AppError(
        "Video is not available. Product must be active and vendor must be approved.",
        404
      );
    }

    return res.status(200).json({
      status: items.length > 0,
      message: "Product video feeds fetched",
      data: items,
      pagination: {
        page: 1,
        limit: items.length,
        total: items.length,
        pages: 1,
      },
    });
  }

  const venueFeeds = await VenueVideoFeed.find({
    venue: feedId,
    status: "active",
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!venueFeeds.length) {
    throw new AppError("Video not found", 404);
  }

  const items = await hydratePublicVenueFeeds(venueFeeds, baseUrl, req.user?._id);
  if (!items.length) {
    throw new AppError(
      "Video is not available. Service must be active and service vendor must be approved.",
      404
    );
  }

  return res.status(200).json({
    status: items.length > 0,
    message: "Service video feeds fetched",
    data: items,
    pagination: {
      page: 1,
      limit: items.length,
      total: items.length,
      pages: 1,
    },
  });
});
