const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  getOrCreateWishlist,
  toggleProductWishlist,
  hydrateWishlistProducts,
  pruneStaleWishlistProducts,
} = require("../../utils/wishlist");

exports.listWishlist = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const baseUrl = getPublicBaseUrl(req);

  const wishlist = await getOrCreateWishlist(req.user._id);
  const productIds = [...wishlist.products].reverse();
  await pruneStaleWishlistProducts(req.user._id, productIds);

  const freshWishlist = await getOrCreateWishlist(req.user._id);
  const orderedIds = [...freshWishlist.products].reverse();
  const total = orderedIds.length;

  const start = (page - 1) * limit;
  const pageIds = orderedIds.slice(start, start + limit);

  const { items } = await hydrateWishlistProducts(pageIds, baseUrl);

  return res.status(200).json({
    status: items.length > 0,
    message: "Wishlist fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

/** One API for heart icon — toggles add/remove and returns isWishlisted */
exports.toggleWishlist = asyncHandler(async (req, res) => {
  assertObjectId(req.params.productId, "Invalid product id");

  const { wishlist, isWishlisted } = await toggleProductWishlist(
    req.user._id,
    req.params.productId
  );

  return res.status(200).json({
    status: true,
    message: isWishlisted ? "Product added to wishlist" : "Product removed from wishlist",
    data: [
      {
        productId: req.params.productId,
        isWishlisted,
        totalItems: wishlist.products.length,
      },
    ],
  });
});
