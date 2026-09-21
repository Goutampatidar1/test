const mongoose = require("mongoose");
const VenueVideoFeed = require("../models/other/venueVideoFeed");
const VenueVideoFeedLike = require("../models/other/venueVideoFeedLike");
const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");

async function assertActiveVenueVideoFeed(feedId) {
  assertObjectId(feedId, "Invalid video feed id");
  const feed = await VenueVideoFeed.findOne({ _id: feedId, status: "active" })
    .select("_id")
    .lean();
  if (!feed) {
    throw new AppError("Video not found or unavailable", 404);
  }
  return feed;
}

async function getVenueLikeMetaForFeeds(feedIds = [], userId = null) {
  const ids = [...new Set(feedIds.map((id) => String(id)).filter(Boolean))];
  const countMap = new Map();
  const likedSet = new Set();

  if (!ids.length) {
    return { countMap, likedSet };
  }

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  const countRows = await VenueVideoFeedLike.aggregate([
    { $match: { videoFeed: { $in: objectIds } } },
    { $group: { _id: "$videoFeed", count: { $sum: 1 } } },
  ]);

  countRows.forEach((row) => {
    countMap.set(String(row._id), row.count);
  });

  if (userId) {
    const likedRows = await VenueVideoFeedLike.find({
      user: userId,
      videoFeed: { $in: objectIds },
    })
      .select("videoFeed")
      .lean();

    likedRows.forEach((row) => {
      likedSet.add(String(row.videoFeed));
    });
  }

  return { countMap, likedSet };
}

async function toggleVenueVideoFeedLike(userId, feedId) {
  await assertActiveVenueVideoFeed(feedId);

  const existing = await VenueVideoFeedLike.findOne({
    user: userId,
    videoFeed: feedId,
  });

  if (existing) {
    await VenueVideoFeedLike.deleteOne({ _id: existing._id });
    const likeCount = await VenueVideoFeedLike.countDocuments({ videoFeed: feedId });
    return { isLiked: false, likeCount, type: "venue" };
  }

  try {
    await VenueVideoFeedLike.create({ user: userId, videoFeed: feedId });
  } catch (err) {
    if (err?.code === 11000) {
      const likeCount = await VenueVideoFeedLike.countDocuments({ videoFeed: feedId });
      return { isLiked: true, likeCount, type: "venue" };
    }
    throw err;
  }

  const likeCount = await VenueVideoFeedLike.countDocuments({ videoFeed: feedId });
  return { isLiked: true, likeCount, type: "venue" };
}

module.exports = {
  assertActiveVenueVideoFeed,
  getVenueLikeMetaForFeeds,
  toggleVenueVideoFeedLike,
};
