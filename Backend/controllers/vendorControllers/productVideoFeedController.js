const ProductVideoFeed = require("../../models/other/productVideoFeed");
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
  loadVendorOwnedProduct,
} = require("../../utils/productVideoFeed");

const FEED_FOLDER = "product-video-feed";

/** Vendor — list own product video feeds */
exports.listMyVideoFeeds = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const [feeds, total] = await Promise.all([
    ProductVideoFeed.find({ vendor: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("product", "name slug sku thumbnail variantType combinations status adminApproved")
      .lean(),
    ProductVideoFeed.countDocuments({ vendor: req.user._id }),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const items = feeds.map((feed) => {
    const product =
      feed.product && typeof feed.product === "object" ? feed.product : null;
    return toVendorVideoFeedCard(feed, product, baseUrl);
  });

  return res.status(200).json({
    status: items.length > 0,
    message: "Video feeds fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/** Vendor — upload product video feed */
exports.createVideoFeed = asyncHandler(async (req, res) => {
  const productId = String(req.body?.productId ?? req.body?.product ?? "").trim();
  let product = null;
  let variantSku = "";

  if (productId) {
    product = await loadVendorOwnedProduct(productId, req.user._id);
    const variant = resolveVariantForProduct(product, req.body?.variantSku);
    variantSku = variant.sku || "";
  }

  assertVideoUpload(req, "video");

  const video = pathForField(req, "video", FEED_FOLDER);
  const thumbnail = pathForField(req, "thumbnail", FEED_FOLDER);
  const title = String(req.body?.title ?? "").trim().slice(0, 32);
  const status = String(req.body?.status ?? "active").trim().toLowerCase();
  if (!["active", "inactive"].includes(status)) {
    throw new AppError("status must be active or inactive", 400);
  }

  const feed = await ProductVideoFeed.create({
    vendor: req.user._id,
    product: product?._id ?? null,
    variantSku,
    video,
    thumbnail,
    title,
    status,
  });

  const baseUrl = getPublicBaseUrl(req);
  const payload = toVendorVideoFeedCard(feed.toObject(), product, baseUrl);

  sendSuccess(res, "Video feed added", payload, 201);
});

async function loadVendorOwnedFeed(vendorId, feedId) {
  assertObjectId(feedId, "Invalid video feed id");
  const feed = await ProductVideoFeed.findOne({ _id: feedId, vendor: vendorId });
  if (!feed) throw new AppError("Video feed not found", 404);
  return feed;
}

/** Vendor — update product video feed */
exports.updateVideoFeed = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId ?? req.params.id;
  const feed = await loadVendorOwnedFeed(req.user._id, feedId);

  let product = feed.product
    ? await loadVendorOwnedProduct(feed.product, req.user._id)
    : null;

  if (req.body?.productId !== undefined || req.body?.product !== undefined) {
    const productId = String(req.body.productId ?? req.body.product ?? "").trim();
    if (!productId) {
      feed.product = null;
      feed.variantSku = "";
      product = null;
    } else {
      product = await loadVendorOwnedProduct(productId, req.user._id);
      feed.product = product._id;
    }
  }

  if (
    product &&
    (req.body?.variantSku !== undefined ||
      req.body?.productId !== undefined ||
      req.body?.product !== undefined)
  ) {
    const variant = resolveVariantForProduct(product, req.body?.variantSku ?? feed.variantSku);
    feed.variantSku = variant.sku || "";
  }

  if (req.body?.title !== undefined) {
    feed.title = String(req.body.title ?? "").trim().slice(0, 32);
  }

  if (req.body?.status !== undefined) {
    const status = String(req.body.status).trim().toLowerCase();
    if (!["active", "inactive"].includes(status)) {
      throw new AppError("status must be active or inactive", 400);
    }
    feed.status = status;
  }

  assertOptionalVideoUpload(req, "video");
  const newVideo = pathForField(req, "video", FEED_FOLDER);
  if (newVideo) {
    deleteUploadFileByPublicUrl(feed.video);
    feed.video = newVideo;
  }

  const newThumbnail = pathForField(req, "thumbnail", FEED_FOLDER);
  if (newThumbnail) {
    if (feed.thumbnail) deleteUploadFileByPublicUrl(feed.thumbnail);
    feed.thumbnail = newThumbnail;
  }

  await feed.save();

  const freshProduct = feed.product
    ? await loadVendorOwnedProduct(feed.product, req.user._id)
    : null;
  const baseUrl = getPublicBaseUrl(req);
  const payload = toVendorVideoFeedCard(feed.toObject(), freshProduct, baseUrl);

  sendSuccess(res, "Video feed updated", payload);
});

/** Vendor — delete product video feed */
exports.deleteVideoFeed = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId ?? req.params.id;
  assertObjectId(feedId, "Invalid video feed id");

  const feed = await ProductVideoFeed.findOne({
    _id: feedId,
    vendor: req.user._id,
  });

  if (!feed) throw new AppError("Video feed not found", 404);

  deleteUploadFileByPublicUrl(feed.video);
  if (feed.thumbnail) deleteUploadFileByPublicUrl(feed.thumbnail);
  await feed.deleteOne();

  sendSuccess(res, "Video feed deleted", { _id: feedId });
});
