const Wishlist = require("../models/other/wishlist");
const Product = require("../models/other/product");
const Vendor = require("../models/entity/vendor");
const mongoose = require("mongoose");
const AppError = require("./AppError");
const { activePublicProductBaseFilter, toPublicProductListCard } = require("./publicProductList");
const { getRatingStatsForProducts, applyRatingStatsToProduct } = require("./productRating");

async function getOrCreateWishlist(userId) {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, products: [] });
  }
  return wishlist;
}

async function assertWishlistProduct(productId) {
  const product = await Product.findOne(activePublicProductBaseFilter({ _id: productId }))
    .select("_id name status adminApproved")
    .lean();
  if (!product) {
    throw new AppError("Product not found or unavailable", 404);
  }
  return product;
}

async function addProductToWishlist(userId, productId) {
  await assertWishlistProduct(productId);
  const wishlist = await getOrCreateWishlist(userId);
  const idStr = String(productId);

  if (wishlist.products.some((id) => String(id) === idStr)) {
    return { wishlist, added: false };
  }

  wishlist.products.push(productId);
  await wishlist.save();
  return { wishlist, added: true };
}

async function toggleProductWishlist(userId, productId) {
  const wishlist = await getOrCreateWishlist(userId);
  const idStr = String(productId);
  const isWishlisted = wishlist.products.some((id) => String(id) === idStr);

  if (isWishlisted) {
    wishlist.products = wishlist.products.filter((id) => String(id) !== idStr);
    await wishlist.save();
    return { wishlist, isWishlisted: false, changed: true };
  }

  await assertWishlistProduct(productId);
  wishlist.products.push(productId);
  await wishlist.save();
  return { wishlist, isWishlisted: true, changed: true };
}

async function removeProductFromWishlist(userId, productId) {
  const wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    return { wishlist: null, removed: false };
  }

  const before = wishlist.products.length;
  wishlist.products = wishlist.products.filter((id) => String(id) !== String(productId));

  if (wishlist.products.length === before) {
    return { wishlist, removed: false };
  }

  await wishlist.save();
  return { wishlist, removed: true };
}

async function removeProductFromAllWishlists(productId) {
  const idStr = String(productId);
  if (!mongoose.Types.ObjectId.isValid(idStr)) return { modifiedCount: 0 };

  const oid = new mongoose.Types.ObjectId(idStr);
  const pullValues = [oid, idStr];

  const result = await Wishlist.updateMany(
    { products: { $in: pullValues } },
    { $pull: { products: { $in: pullValues } } }
  );

  return result;
}

async function hydrateWishlistProducts(productIds, baseUrl) {
  if (!productIds.length) {
    return { items: [], validIds: new Set() };
  }

  const products = await Product.find({
    ...activePublicProductBaseFilter(),
    _id: { $in: productIds },
  })
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .lean();

  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const vendorIds = [...new Set(products.map((p) => String(p.addedById)).filter(Boolean))];
  const [vendors, ratingStatsMap] = await Promise.all([
    Vendor.find({
      _id: { $in: vendorIds },
      status: "active",
      approvalStatus: "approved",
      isOpen: { $ne: false },
    })
      .select("businessName shopLogo")
      .lean(),
    getRatingStatsForProducts(products.map((product) => product._id)),
  ]);
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));

  const items = [];
  const validIds = new Set();

  for (const productId of productIds) {
    const product = productMap.get(String(productId));
    if (!product) continue;

    const vendor = vendorMap.get(String(product.addedById));
    if (!vendor) continue;

    const enrichedProduct = applyRatingStatsToProduct(product, ratingStatsMap);
    const card = toPublicProductListCard(enrichedProduct, vendor, baseUrl, { isWishlisted: true });
    if (card) {
      items.push(card);
      validIds.add(String(productId));
    }
  }

  return { items, validIds };
}

async function pruneStaleWishlistProducts(userId, productIds) {
  if (!productIds?.length) return;

  const existing = await Product.find({ _id: { $in: productIds } }).select("_id").lean();
  const existingSet = new Set(existing.map((row) => String(row._id)));
  const staleIds = productIds.filter((id) => !existingSet.has(String(id)));

  if (!staleIds.length) return;
  await Wishlist.updateOne({ user: userId }, { $pull: { products: { $in: staleIds } } });
}

module.exports = {
  getOrCreateWishlist,
  addProductToWishlist,
  toggleProductWishlist,
  removeProductFromWishlist,
  removeProductFromAllWishlists,
  hydrateWishlistProducts,
  pruneStaleWishlistProducts,
};
