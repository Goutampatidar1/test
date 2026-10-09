const Vendor = require("../models/entity/vendor");
const Wishlist = require("../models/other/wishlist");
const { getPublicBaseUrl } = require("./mediaUrl");
const {
  resolvePublicProductSeller,
  toPublicProductListCard,
} = require("./publicProductList");
const {
  getUserRatingsForProducts,
  getRatingStatsForProducts,
  applyRatingStatsToProduct,
} = require("./productRating");
const { buildProductCartDetailMap } = require("./cart");

/**
 * Turn raw product docs into public list cards (seller visibility, ratings,
 * wishlist, cart detail). Products whose vendor is closed / unapproved are dropped.
 * Used by the catalog list, hot deals, category-wise home, and suggestions.
 */
async function buildProductCards(products, req, { baseUrl, decorate } = {}) {
  if (!Array.isArray(products) || products.length === 0) return [];
  const resolvedBaseUrl = baseUrl ?? getPublicBaseUrl(req);

  const vendorIds = [...new Set(products.map((p) => String(p.addedById)).filter(Boolean))];
  const productIds = products.map((product) => product._id);

  const [vendors, ratingStatsMap] = await Promise.all([
    Vendor.find({
      _id: { $in: vendorIds },
      status: "active",
      approvalStatus: "approved",
      isOpen: { $ne: false },
    })
      .select("businessName shopLogo")
      .lean(),
    getRatingStatsForProducts(productIds),
  ]);
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

  let wishlistSet = new Set();
  let myRatingMap = new Map();
  let cartDetailMap = new Map();
  if (req?.user?._id) {
    const [wishlist, ratings, cartDetails] = await Promise.all([
      Wishlist.findOne({ user: req.user._id }).select("products").lean(),
      getUserRatingsForProducts(req.user._id, productIds),
      buildProductCartDetailMap(req.user._id, productIds),
    ]);
    wishlistSet = new Set((wishlist?.products || []).map((id) => String(id)));
    myRatingMap = ratings;
    cartDetailMap = cartDetails;
  }

  return products
    .map((product) => {
      const seller = resolvePublicProductSeller(product, vendorMap);
      if (!seller) return null;
      const enriched = applyRatingStatsToProduct(product, ratingStatsMap);
      const card = toPublicProductListCard(enriched, seller, resolvedBaseUrl, {
        isWishlisted: wishlistSet.has(String(product._id)),
        myRating: myRatingMap.get(String(product._id)) ?? null,
        cartDetail: cartDetailMap.get(String(product._id)) ?? null,
      });
      return card && decorate ? decorate(card, product) : card;
    })
    .filter(Boolean);
}

module.exports = { buildProductCards };
