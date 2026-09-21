const VenueVideoFeed = require("../../models/other/venueVideoFeed");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const { deleteUploadFileByPublicUrl } = require("../../utils/deleteUploadFile");
const {
  pathForField,
  assertVideoUpload,
  assertOptionalVideoUpload,
  toVenueVendorVideoFeedCard,
  loadVenueVendorOwnedVenue,
} = require("../../utils/venueVideoFeed");

const FEED_FOLDER = "venue-video-feed";

exports.listMyVideoFeeds = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const [feeds, total] = await Promise.all([
    VenueVideoFeed.find({ venueVendor: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("venue", "name thumbnail dayPrice basePrice city state status adminApproved")
      .lean(),
    VenueVideoFeed.countDocuments({ venueVendor: req.user._id }),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const items = feeds.map((feed) => {
    const venue = feed.venue && typeof feed.venue === "object" ? feed.venue : null;
    return toVenueVendorVideoFeedCard(feed, venue, baseUrl);
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

exports.createVideoFeed = asyncHandler(async (req, res) => {
  const venueId = String(req.body?.venueId ?? req.body?.venue ?? "").trim();
  let venue = null;

  if (venueId) {
    venue = await loadVenueVendorOwnedVenue(venueId, req.user._id);
  }

  assertVideoUpload(req, "video");

  const video = pathForField(req, "video", FEED_FOLDER);
  const thumbnail = pathForField(req, "thumbnail", FEED_FOLDER);
  const title = String(req.body?.title ?? "").trim().slice(0, 32);

  const feed = await VenueVideoFeed.create({
    venueVendor: req.user._id,
    venue: venue?._id ?? null,
    video,
    thumbnail,
    title,
    status: "active",
  });

  const baseUrl = getPublicBaseUrl(req);
  const payload = toVenueVendorVideoFeedCard(feed.toObject(), venue, baseUrl);

  sendSuccess(res, "Video feed added", payload, 201);
});

async function loadVenueVendorOwnedFeed(venueVendorId, feedId) {
  assertObjectId(feedId, "Invalid video feed id");
  const feed = await VenueVideoFeed.findOne({ _id: feedId, venueVendor: venueVendorId });
  if (!feed) throw new AppError("Video feed not found", 404);
  return feed;
}

exports.updateVideoFeed = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId ?? req.params.id;
  const feed = await loadVenueVendorOwnedFeed(req.user._id, feedId);

  let venue = feed.venue
    ? await loadVenueVendorOwnedVenue(feed.venue, req.user._id)
    : null;

  if (req.body?.venueId !== undefined || req.body?.venue !== undefined) {
    const venueId = String(req.body.venueId ?? req.body.venue ?? "").trim();
    if (!venueId) {
      feed.venue = null;
      venue = null;
    } else {
      venue = await loadVenueVendorOwnedVenue(venueId, req.user._id);
      feed.venue = venue._id;
    }
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

  const freshVenue = feed.venue
    ? await loadVenueVendorOwnedVenue(feed.venue, req.user._id)
    : null;
  const baseUrl = getPublicBaseUrl(req);
  const payload = toVenueVendorVideoFeedCard(feed.toObject(), freshVenue, baseUrl);

  sendSuccess(res, "Video feed updated", payload);
});

exports.deleteVideoFeed = asyncHandler(async (req, res) => {
  const feedId = req.params.feedId ?? req.params.id;
  assertObjectId(feedId, "Invalid video feed id");

  const feed = await VenueVideoFeed.findOne({
    _id: feedId,
    venueVendor: req.user._id,
  });

  if (!feed) throw new AppError("Video feed not found", 404);

  deleteUploadFileByPublicUrl(feed.video);
  if (feed.thumbnail) deleteUploadFileByPublicUrl(feed.thumbnail);
  await feed.deleteOne();

  sendSuccess(res, "Video feed deleted", { _id: feedId });
});
