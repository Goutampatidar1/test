const DeliveryBoyRating = require("../../models/other/deliveryBoyRating");
const User = require("../../models/entity/user");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { toPublicDeliveryBoyRatingItem } = require("../../utils/deliveryBoyRating");
const { toObjectId } = require("../../utils/productRating");

exports.listDriverRatings = asyncHandler(async (req, res) => {
  const deliveryBoyId = req.params.deliveryBoyId ?? req.params.driverId;
  assertObjectId(deliveryBoyId, "Invalid driver id");

  const { page, limit, skip } = getPagination(req.query);
  const baseUrl = getPublicBaseUrl(req);
  const filter = { deliveryBoy: toObjectId(deliveryBoyId) };

  const [rows, total] = await Promise.all([
    DeliveryBoyRating.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    DeliveryBoyRating.countDocuments(filter),
  ]);

  const userIds = [...new Set(rows.map((row) => String(row.user)).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name profileImage")
    .lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const items = rows
    .map((row) => toPublicDeliveryBoyRatingItem(row, userMap.get(String(row.user)), baseUrl))
    .filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Driver reviews fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});
