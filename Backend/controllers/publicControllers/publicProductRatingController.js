const ProductRating = require("../../models/other/productRating");
const User = require("../../models/entity/user");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { toPublicProductRatingItem, toObjectId } = require("../../utils/productRating");

exports.listProductRatings = asyncHandler(async (req, res) => {
  assertObjectId(req.params.productId, "Invalid product id");

  const { page, limit, skip } = getPagination(req.query);
  const baseUrl = getPublicBaseUrl(req);

  const filter = { product: toObjectId(req.params.productId) };

  const [rows, total] = await Promise.all([
    ProductRating.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ProductRating.countDocuments(filter),
  ]);

  const userIds = [...new Set(rows.map((row) => String(row.user)).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name profileImage")
    .lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const items = rows
    .map((row) => toPublicProductRatingItem(row, userMap.get(String(row.user)), baseUrl))
    .filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Product ratings fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});
