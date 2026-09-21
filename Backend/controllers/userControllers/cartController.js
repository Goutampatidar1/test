const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  setProductCartQuantity,
  changeCartItemQuantity,
  removeCartItem,
  getOrCreateCart,
  hydrateCartItems,
  toCartActionPayload,
  toCartSummary,
  toProductCartDetail,
  getCartLinesForProduct,
  refreshCartTotals,
  pruneUnavailableCartItems,
  getCartCount,
  assertCartProduct,
  resolveCartVariant,
  resolveCartLineOptions,
} = require("../../utils/cart");

function readCartRequest(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};

  let selectedAttributes = body.selectedAttributes ?? query.selectedAttributes;
  if (typeof selectedAttributes === "string" && selectedAttributes.trim()) {
    try {
      selectedAttributes = JSON.parse(selectedAttributes);
    } catch {
      selectedAttributes = undefined;
    }
  }

  const combinationIndexRaw =
    body.combinationIndex ?? body.combination_index ?? query.combinationIndex ?? query.combination_index;

  return {
    productId: body.productId ?? query.productId ?? req.params.productId,
    variantSku:
      body.variantSku ??
      body.variant_sku ??
      body.combinationSku ??
      body.combination_sku ??
      body.sku ??
      query.variantSku ??
      query.variant_sku ??
      query.combinationSku ??
      "",
    size: body.size ?? body.selectedSize ?? query.size ?? query.selectedSize,
    color: body.color ?? body.selectedColor ?? query.color ?? query.selectedColor,
    selectedAttributes: Array.isArray(selectedAttributes) ? selectedAttributes : undefined,
    combinationIndex:
      combinationIndexRaw === undefined || combinationIndexRaw === ""
        ? undefined
        : Number(combinationIndexRaw),
    quantity: body.quantity ?? query.quantity,
  };
}

function resolveProductId(req) {
  const { productId } = readCartRequest(req);
  if (!productId) {
    throw new AppError("productId is required", 400);
  }
  assertObjectId(productId, "Invalid product id");
  return productId;
}

exports.listCart = asyncHandler(async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  await pruneUnavailableCartItems(req.user._id);
  const cart = await getOrCreateCart(req.user._id);
  await refreshCartTotals(cart);

  const items = await hydrateCartItems(cart, baseUrl);

  return res.status(200).json({
    status: items.length > 0,
    message: "Cart fetched",
    data: items,
    summary: toCartSummary(cart, items.length),
  });
});

/** Add / update / remove — always send final quantity in body */
exports.addToCart = asyncHandler(async (req, res) => {
  const productId = resolveProductId(req);
  const options = readCartRequest(req);

  const result = await setProductCartQuantity(req.user._id, productId, options);

  let message = "Cart quantity updated";
  if (result.removed) message = "Product removed from cart";
  else if (result.vendorCartCleared && result.isCreated) {
    message = "Previous vendor items removed. Product added to cart";
  } else if (result.isCreated) message = "Product added to cart";

  return res.status(200).json({
    status: true,
    message,
    data: [toCartActionPayload(result)],
  });
});

exports.getCartItemState = asyncHandler(async (req, res) => {
  const productId = resolveProductId(req);
  const options = readCartRequest(req);
  const cart = await getOrCreateCart(req.user._id);
  const resolvedOptions = resolveCartLineOptions(cart, productId, options);
  const product = await assertCartProduct(productId);
  const variant = resolveCartVariant(product, resolvedOptions);
  const productCart = toProductCartDetail(getCartLinesForProduct(cart, productId));

  return res.status(200).json({
    status: true,
    message: productCart.inCart ? "Cart item fetched" : "Product not in cart",
    data: [
      {
        productId,
        variantSku: variant.variantSku ?? "",
        quantity: productCart.quantity,
        inCart: productCart.inCart,
        itemTotal: productCart.itemTotal,
        itemTotalLabel: productCart.itemTotalLabel,
        items: productCart.items,
        cartCount: getCartCount(cart),
      },
    ],
  });
});

exports.removeFromCart = asyncHandler(async (req, res) => {
  const productId = resolveProductId(req);
  const options = readCartRequest(req);
  const cart = await getOrCreateCart(req.user._id);
  const resolvedOptions = resolveCartLineOptions(cart, productId, options);
  const product = await assertCartProduct(productId);
  const variant = resolveCartVariant(product, resolvedOptions);
  const updatedCart = await removeCartItem(req.user._id, productId, resolvedOptions);

  return res.status(200).json({
    status: true,
    message: "Product removed from cart",
    data: [
      toCartActionPayload({
        cart: updatedCart,
        item: null,
        product,
        variant,
        removed: true,
      }),
    ],
  });
});

async function adjustCartQuantity(req, res, delta) {
  const productId = resolveProductId(req);
  const options = readCartRequest(req);
  const hasExplicitQuantity =
    options.quantity !== undefined && options.quantity !== null && options.quantity !== "";

  let result;
  let message;

  if (hasExplicitQuantity) {
    result = await setProductCartQuantity(req.user._id, productId, options);
    if (result.removed) message = "Product removed from cart";
    else if (result.vendorCartCleared && result.isCreated) {
      message = "Previous vendor items removed. Product added to cart";
    } else message = "Cart quantity updated";
  } else {
    result = await changeCartItemQuantity(req.user._id, productId, delta, options);
    if (result.removed) {
      message = "Product removed from cart";
    } else if (delta > 0) {
      message = result.vendorCartCleared
        ? "Previous vendor items removed. Cart quantity increased"
        : "Cart quantity increased";
    } else {
      message = "Cart quantity decreased";
    }
  }

  return res.status(200).json({
    status: true,
    message,
    data: [toCartActionPayload(result)],
  });
}

exports.increaseCartQuantity = asyncHandler((req, res) => adjustCartQuantity(req, res, 1));
exports.decreaseCartQuantity = asyncHandler((req, res) => adjustCartQuantity(req, res, -1));
