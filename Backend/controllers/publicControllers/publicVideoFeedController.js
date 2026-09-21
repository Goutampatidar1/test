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

async function hydratePublicEcomFeeds(feeds, baseUrl, userId = null) {
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
    })
      .select("businessName shopLogo city state")
      .lean(),
  ]);

  const productCounts = vendors.length
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

async function hydratePublicVenueFeeds(feeds, baseUrl, userId = null) {
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
    })
      .select("name businessName profileImage businessAddress")
      .lean(),
  ]);

  const venueCounts = venueVendors.length
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
exports.listVideoFeeds = asyncHandler(async (req, res) => {
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
});

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
