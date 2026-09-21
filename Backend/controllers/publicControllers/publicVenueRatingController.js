const VenueRating = require("../../models/other/venueRating");
const User = require("../../models/entity/user");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { toPublicVenueRatingItem } = require("../../utils/venueRating");
const { toObjectId } = require("../../utils/productRating");

exports.listVenueRatings = asyncHandler(async (req, res) => {
  assertObjectId(req.params.venueId, "Invalid venue id");

  const { page, limit, skip } = getPagination(req.query);
  const baseUrl = getPublicBaseUrl(req);
  const filter = { venue: toObjectId(req.params.venueId) };

  const [rows, total] = await Promise.all([
    VenueRating.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    VenueRating.countDocuments(filter),
  ]);

  const userIds = [...new Set(rows.map((row) => String(row.user)).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name profileImage")
    .lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const items = rows
    .map((row) => toPublicVenueRatingItem(row, userMap.get(String(row.user)), baseUrl))
    .filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Venue reviews fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});
