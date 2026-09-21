const Product = require("../../models/other/product");
const ProductVideoFeed = require("../../models/other/productVideoFeed");
const Venue = require("../../models/other/venue");
const VenueVideoFeed = require("../../models/other/venueVideoFeed");
const Vendor = require("../../models/entity/vendor");
const VenueVendor = require("../../models/entity/venueVendor");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const {
  resolveVariantForProduct,
  pathForField,
  assertVideoUpload,
  assertOptionalVideoUpload,
  toVendorVideoFeedCard,
} = require("../../utils/productVideoFeed");
const {
  pathForField: venuePathForField,
  assertVideoUpload: assertVenueVideoUpload,
  assertOptionalVideoUpload: assertOptionalVenueVideoUpload,
  toVenueVendorVideoFeedCard,
} = require("../../utils/venueVideoFeed");

const ECOM_FOLDER = "video-feed";
const VENUE_FOLDER = "video-feed";

function normalizeFeedType(raw, { required = true } = {}) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) {
    if (required) throw new AppError("type is required. Use ecom or venue", 400);
    return "";
  }
  if (value === "ecom" || value === "product" || value === "products") return "ecom";
  if (value === "venue" || value === "venues" || value === "service" || value === "services") {
    return "venue";
  }
  throw new AppError("Invalid type. Use ecom or venue", 400);
}

async function loadProductForAdmin(productId) {
  assertObjectId(productId, "Invalid product id");
  const product = await Product.findById(productId).lean();
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

async function loadVenueForAdmin(venueId) {
  assertObjectId(venueId, "Invalid venue id");
  const venue = await Venue.findById(venueId).lean();
  if (!venue) throw new AppError("Service not found", 404);
  return venue;
}

async function resolveEcomVendorId(body, product) {
  if (product?.role === "Vendor" && product.addedById) {
    return String(product.addedById);
  }
  const vendorId = String(body?.vendorId ?? body?.vendor ?? "").trim();
  if (!vendorId) {
    throw new AppError("vendorId is required when product is not selected", 400);
  }
  assertObjectId(vendorId, "Invalid vendor id");
  const vendor = await Vendor.findById(vendorId).select("_id").lean();
  if (!vendor) throw new AppError("Vendor not found", 404);
  return String(vendor._id);
}

async function resolveVenueVendorId(body, venue) {
  if (venue?.role === "VenueVendor" && venue.addedById) {
    return String(venue.addedById);
  }
  const venueVendorId = String(body?.venueVendorId ?? body?.venueVendor ?? "").trim();
  if (!venueVendorId) {
    throw new AppError("venueVendorId is required when service is not selected", 400);
  }
  assertObjectId(venueVendorId, "Invalid service vendor id");
  const venueVendor = await VenueVendor.findById(venueVendorId).select("_id").lean();
  if (!venueVendor) throw new AppError("Service vendor not found", 404);
  return String(venueVendor._id);
}

exports.listVideoFeeds = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const typeFilter = String(req.query.type ?? req.query.feedType ?? "all").trim().toLowerCase();
  const baseUrl = getPublicBaseUrl(req);

  const includeEcom = !typeFilter || typeFilter === "all" || typeFilter === "ecom";
  const includeVenue = !typeFilter || typeFilter === "all" || typeFilter === "venue";

  const items = [];
  let total = 0;

  if (typeFilter === "ecom") {
    const [feeds, count] = await Promise.all([
      ProductVideoFeed.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("product", "name slug sku thumbnail variantType")
        .populate("vendor", "name businessName")
        .lean(),
      ProductVideoFeed.countDocuments({}),
    ]);
    total = count;
    for (const feed of feeds) {
      const product = feed.product && typeof feed.product === "object" ? feed.product : null;
      items.push({
        ...toVendorVideoFeedCard(feed, product, baseUrl),
        type: "ecom",
        vendor: feed.vendor || null,
      });
    }
  } else if (typeFilter === "venue") {
    const [feeds, count] = await Promise.all([
      VenueVideoFeed.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("venue", "name thumbnail dayPrice basePrice city state")
        .populate("venueVendor", "name businessName")
        .lean(),
      VenueVideoFeed.countDocuments({}),
    ]);
    total = count;
    for (const feed of feeds) {
      const venue = feed.venue && typeof feed.venue === "object" ? feed.venue : null;
      items.push({
        ...toVenueVendorVideoFeedCard(feed, venue, baseUrl),
        type: "venue",
        venueVendor: feed.venueVendor || null,
      });
    }
  } else {
    const fetchLimit = skip + limit;
    const [ecomFeeds, venueFeeds, ecomCount, venueCount] = await Promise.all([
      includeEcom
        ? ProductVideoFeed.find({})
            .sort({ createdAt: -1 })
            .limit(fetchLimit)
            .populate("product", "name slug sku thumbnail variantType")
            .populate("vendor", "name businessName")
            .lean()
        : Promise.resolve([]),
      includeVenue
        ? VenueVideoFeed.find({})
            .sort({ createdAt: -1 })
            .limit(fetchLimit)
            .populate("venue", "name thumbnail dayPrice basePrice city state")
            .populate("venueVendor", "name businessName")
            .lean()
        : Promise.resolve([]),
      includeEcom ? ProductVideoFeed.countDocuments({}) : Promise.resolve(0),
      includeVenue ? VenueVideoFeed.countDocuments({}) : Promise.resolve(0),
    ]);
    total = ecomCount + venueCount;

    const mapped = [
      ...ecomFeeds.map((feed) => {
        const product = feed.product && typeof feed.product === "object" ? feed.product : null;
        return {
          ...toVendorVideoFeedCard(feed, product, baseUrl),
          type: "ecom",
          vendor: feed.vendor || null,
          createdAt: feed.createdAt,
        };
      }),
      ...venueFeeds.map((feed) => {
        const venue = feed.venue && typeof feed.venue === "object" ? feed.venue : null;
        return {
          ...toVenueVendorVideoFeedCard(feed, venue, baseUrl),
          type: "venue",
          venueVendor: feed.venueVendor || null,
          createdAt: feed.createdAt,
        };
      }),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    items.push(...mapped.slice(skip, skip + limit));
  }

  return res.status(200).json({
    status: true,
    message: "Video feeds fetched",
    videoFeeds: items,
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.createVideoFeed = asyncHandler(async (req, res) => {
  const type = normalizeFeedType(req.body?.type ?? req.body?.feedType);
  const title = String(req.body?.title ?? "").trim().slice(0, 32);
  const baseUrl = getPublicBaseUrl(req);

  if (type === "ecom") {
    assertVideoUpload(req, "video");
    const productId = String(req.body?.productId ?? req.body?.product ?? "").trim();
    let product = null;
    let variantSku = "";
    if (productId) {
      product = await loadProductForAdmin(productId);
      const variant = resolveVariantForProduct(product, req.body?.variantSku);
      variantSku = variant.sku || "";
    }
    const vendorId = await resolveEcomVendorId(req.body, product);
    const feed = await ProductVideoFeed.create({
      vendor: vendorId,
      product: product?._id ?? null,
      variantSku,
      video: pathForField(req, "video", ECOM_FOLDER),
      thumbnail: pathForField(req, "thumbnail", ECOM_FOLDER),
      title: "",
      status: "active",
    });
    return sendSuccess(
      res,
      "Video feed added",
      { ...toVendorVideoFeedCard(feed.toObject(), product, baseUrl), type: "ecom" },
      201
    );
  }

  assertVenueVideoUpload(req, "video");
  const venueId = String(req.body?.venueId ?? req.body?.venue ?? "").trim();
  let venue = null;
  if (venueId) {
    venue = await loadVenueForAdmin(venueId);
  }
  const venueVendorId = await resolveVenueVendorId(req.body, venue);
  const feed = await VenueVideoFeed.create({
    venueVendor: venueVendorId,
    venue: venue?._id ?? null,
    video: venuePathForField(req, "video", VENUE_FOLDER),
    thumbnail: venuePathForField(req, "thumbnail", VENUE_FOLDER),
    title,
    status: "active",
  });
  return sendSuccess(
    res,
    "Video feed added",
    { ...toVenueVendorVideoFeedCard(feed.toObject(), venue, baseUrl), type: "venue" },
    201
  );
});

exports.updateVideoFeed = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId ?? req.params.id;
  assertObjectId(feedId, "Invalid video feed id");
  const type = normalizeFeedType(req.body?.type ?? req.body?.feedType ?? req.query?.type);
  const baseUrl = getPublicBaseUrl(req);

  if (type === "ecom") {
    const feed = await ProductVideoFeed.findById(feedId);
    if (!feed) throw new AppError("Video feed not found", 404);

    let product = feed.product ? await loadProductForAdmin(feed.product) : null;
    if (req.body?.productId !== undefined || req.body?.product !== undefined) {
      const productId = String(req.body.productId ?? req.body.product ?? "").trim();
      if (!productId) {
        feed.product = null;
        feed.variantSku = "";
        product = null;
      } else {
        product = await loadProductForAdmin(productId);
        feed.product = product._id;
        if (product.role === "Vendor" && product.addedById) {
          feed.vendor = product.addedById;
        }
      }
    }
    if (req.body?.vendorId || req.body?.vendor) {
      feed.vendor = await resolveEcomVendorId(req.body, product);
    }
    if (product && (req.body?.variantSku !== undefined || req.body?.productId !== undefined)) {
      const variant = resolveVariantForProduct(product, req.body?.variantSku ?? feed.variantSku);
      feed.variantSku = variant.sku || "";
    }
    if (req.body?.title !== undefined) feed.title = "";
    if (req.body?.status !== undefined) {
      const status = String(req.body.status).trim().toLowerCase();
      if (!["active", "inactive"].includes(status)) {
        throw new AppError("status must be active or inactive", 400);
      }
      feed.status = status;
    }
    assertOptionalVideoUpload(req, "video");
    const newVideo = pathForField(req, "video", ECOM_FOLDER);
    if (newVideo) {
      deleteUploadFileByPublicUrl(feed.video);
      feed.video = newVideo;
    }
    const newThumbnail = pathForField(req, "thumbnail", ECOM_FOLDER);
    if (newThumbnail) {
      if (feed.thumbnail) deleteUploadFileByPublicUrl(feed.thumbnail);
      feed.thumbnail = newThumbnail;
    }
    await feed.save();
    const freshProduct = feed.product ? await loadProductForAdmin(feed.product) : null;
    return sendSuccess(res, "Video feed updated", {
      ...toVendorVideoFeedCard(feed.toObject(), freshProduct, baseUrl),
      type: "ecom",
    });
  }

  const feed = await VenueVideoFeed.findById(feedId);
  if (!feed) throw new AppError("Video feed not found", 404);

  let venue = feed.venue ? await loadVenueForAdmin(feed.venue) : null;
  if (req.body?.venueId !== undefined || req.body?.venue !== undefined) {
    const venueId = String(req.body.venueId ?? req.body.venue ?? "").trim();
    if (!venueId) {
      feed.venue = null;
      venue = null;
    } else {
      venue = await loadVenueForAdmin(venueId);
      feed.venue = venue._id;
      if (venue.role === "VenueVendor" && venue.addedById) {
        feed.venueVendor = venue.addedById;
      }
    }
  }
  if (req.body?.venueVendorId || req.body?.venueVendor) {
    feed.venueVendor = await resolveVenueVendorId(req.body, venue);
  }
  if (req.body?.title !== undefined) feed.title = String(req.body.title ?? "").trim().slice(0, 32);
  if (req.body?.status !== undefined) {
    const status = String(req.body.status).trim().toLowerCase();
    if (!["active", "inactive"].includes(status)) {
      throw new AppError("status must be active or inactive", 400);
    }
    feed.status = status;
  }
  assertOptionalVenueVideoUpload(req, "video");
  const newVideo = venuePathForField(req, "video", VENUE_FOLDER);
  if (newVideo) {
    deleteUploadFileByPublicUrl(feed.video);
    feed.video = newVideo;
  }
  const newThumbnail = venuePathForField(req, "thumbnail", VENUE_FOLDER);
  if (newThumbnail) {
    if (feed.thumbnail) deleteUploadFileByPublicUrl(feed.thumbnail);
    feed.thumbnail = newThumbnail;
  }
  await feed.save();
  const freshVenue = feed.venue ? await loadVenueForAdmin(feed.venue) : null;
  return sendSuccess(res, "Video feed updated", {
    ...toVenueVendorVideoFeedCard(feed.toObject(), freshVenue, baseUrl),
    type: "venue",
  });
});

exports.deleteVideoFeed = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId ?? req.params.id;
  assertObjectId(feedId, "Invalid video feed id");
  const type = normalizeFeedType(req.body?.type ?? req.query?.type ?? req.body?.feedType);

  if (type === "ecom") {
    const feed = await ProductVideoFeed.findById(feedId);
    if (!feed) throw new AppError("Video feed not found", 404);
    deleteUploadFileByPublicUrl(feed.video);
    if (feed.thumbnail) deleteUploadFileByPublicUrl(feed.thumbnail);
    await feed.deleteOne();
    return sendSuccess(res, "Video feed deleted", { _id: feedId, type: "ecom" });
  }

  const feed = await VenueVideoFeed.findById(feedId);
  if (!feed) throw new AppError("Video feed not found", 404);
  deleteUploadFileByPublicUrl(feed.video);
  if (feed.thumbnail) deleteUploadFileByPublicUrl(feed.thumbnail);
  await feed.deleteOne();
  return sendSuccess(res, "Video feed deleted", { _id: feedId, type: "venue" });
});
