const ProductVideoFeed = require("../models/other/productVideoFeed");
const ProductVideoFeedLike = require("../models/other/productVideoFeedLike");
const mongoose = require("mongoose");
const AppError = require("./AppError");
const { assertObjectId } = require("./assertObjectId");

async function assertActiveVideoFeed(feedId) {
  assertObjectId(feedId, "Invalid video feed id");
  const feed = await ProductVideoFeed.findOne({ _id: feedId, status: "active" })
    .select("_id")
    .lean();
  if (!feed) {
    throw new AppError("Video not found or unavailable", 404);
  }
  return feed;
}

async function getLikeMetaForFeeds(feedIds = [], userId = null) {
  const ids = [...new Set(feedIds.map((id) => String(id)).filter(Boolean))];
  const countMap = new Map();
  const likedSet = new Set();

  if (!ids.length) {
    return { countMap, likedSet };
  }

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  const countRows = await ProductVideoFeedLike.aggregate([
    { $match: { videoFeed: { $in: objectIds } } },
    { $group: { _id: "$videoFeed", count: { $sum: 1 } } },
  ]);

  countRows.forEach((row) => {
    countMap.set(String(row._id), row.count);
  });

  if (userId) {
    const likedRows = await ProductVideoFeedLike.find({
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

async function toggleVideoFeedLike(userId, feedId) {
  await assertActiveVideoFeed(feedId);

  const existing = await ProductVideoFeedLike.findOne({
    user: userId,
    videoFeed: feedId,
  });

  if (existing) {
    await ProductVideoFeedLike.deleteOne({ _id: existing._id });
    const likeCount = await ProductVideoFeedLike.countDocuments({ videoFeed: feedId });
    return { isLiked: false, likeCount };
  }

  try {
    await ProductVideoFeedLike.create({ user: userId, videoFeed: feedId });
  } catch (err) {
    if (err?.code === 11000) {
      const likeCount = await ProductVideoFeedLike.countDocuments({ videoFeed: feedId });
      return { isLiked: true, likeCount };
    }
    throw err;
  }

  const likeCount = await ProductVideoFeedLike.countDocuments({ videoFeed: feedId });
  return { isLiked: true, likeCount };
}

module.exports = {
  assertActiveVideoFeed,
  getLikeMetaForFeeds,
  toggleVideoFeedLike,
};
