const mongoose = require("mongoose");
const Cart = require("../models/other/cart");
const Product = require("../models/other/product");
const Vendor = require("../models/entity/vendor");
const AppError = require("./AppError");
const {
  activePublicProductBaseFilter,
  applyDiscount,
  formatInrAmount,
} = require("./publicProductList");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { getConfiguredShippingCharge } = require("./appCommerceSettings");
const { combinationMatchesSelection, mapCombinationAttributes, normalizeTitle } = require("./productVariants");

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function normalizeSku(value) {
  return String(value || "").trim();
}

async function assertCartProduct(productId) {
  const product = await Product.findOne(activePublicProductBaseFilter({ _id: productId }))
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .lean();

  if (!product) {
    throw new AppError("Product not found or unavailable", 404);
  }

  return product;
}

function combinationMatchesAttributes(combination, selectedAttributes = []) {
  if (!selectedAttributes.length) return false;

  const attrs = mapCombinationAttributes(combination);
  return selectedAttributes.every((sel) => {
    const title = normalizeTitle(sel?.title ?? sel?.name ?? "");
    const value = normalizeTitle(sel?.value ?? "");
    if (!title || !value) return false;

    return attrs.some((attr) => attr.titleKey === title && normalizeTitle(attr.value) === value);
  });
}

function assertVariantStockAvailable(product, variant, quantity, { productName } = {}) {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return;

  const stock = Number(variant?.stock ?? product?.stock) || 0;
  if (qty > stock) {
    const label = productName || product?.name || "Product";
    throw new AppError(`${label}: only ${stock} item(s) available`, 400);
  }
}

function resolveCartVariant(product, { variantSku, size, color, selectedAttributes, combinationIndex } = {}) {
  if (product.variantType !== "multi") {
    return {
      variantSku: "",
      sku: product.sku,
      unitPrice: applyDiscount(product.price, product.discountType, product.discountValue),
      mrp: Number(product.price) || 0,
      stock: Number(product.stock) || 0,
      discountValue: Number(product.discountValue) || 0,
      selectedAttributes: [],
    };
  }

  const activeCombos = (product.combinations ?? []).filter((combo) => combo.status !== "inactive");
  if (!activeCombos.length) {
    throw new AppError("No active variants available for this product", 400);
  }

  const normalizedSku = normalizeSku(variantSku);
  let combo = null;

  if (normalizedSku) {
    combo = activeCombos.find((item) => normalizeSku(item.sku) === normalizedSku);
    if (!combo) throw new AppError("Selected variant not found", 400);
  } else if (Array.isArray(selectedAttributes) && selectedAttributes.length) {
    const matches = activeCombos.filter((item) => combinationMatchesAttributes(item, selectedAttributes));
    if (matches.length === 1) {
      combo = matches[0];
    } else if (matches.length > 1) {
      throw new AppError("Ambiguous variant selection. Send variantSku.", 400);
    } else {
      throw new AppError("Selected variant not found", 400);
    }
  } else if (size || color) {
    const matches = activeCombos.filter((item) =>
      combinationMatchesSelection(item, { size, color }, product)
    );
    if (matches.length === 1) {
      combo = matches[0];
    } else if (matches.length > 1) {
      throw new AppError(
        "Ambiguous variant selection. Send variantSku or both size and color.",
        400
      );
    } else {
      throw new AppError("Selected size/color combination not found", 400);
    }
  } else if (
    combinationIndex !== undefined &&
    Number.isInteger(combinationIndex) &&
    combinationIndex >= 0 &&
    combinationIndex < activeCombos.length
  ) {
    combo = activeCombos[combinationIndex];
  } else {
    throw new AppError(
      "variantSku (or sku), size/color, selectedAttributes, or combinationIndex is required for multi-variant products",
      400
    );
  }

  const resolvedAttributes = mapCombinationAttributes(combo).map((attr) => ({
    title: attr.title,
    value: attr.value,
  }));

  return {
    variantSku: combo.sku,
    sku: combo.sku,
    unitPrice: applyDiscount(
      combo.price,
      product.discountType,
      combo.discountValue ?? product.discountValue
    ),
    mrp: Number(combo.price) || 0,
    stock: Number(combo.stock) || 0,
    discountValue: Number(combo.discountValue ?? product.discountValue) || 0,
    selectedAttributes: resolvedAttributes,
  };
}

function calculateLineTotals(quantity, unitPrice, savingsPerUnit = 0, taxValue = 0) {
  const qty = Math.max(1, Number(quantity) || 1);
  const price = Number(unitPrice) || 0;
  const savings = Math.max(0, Number(savingsPerUnit) || 0);
  const tax = Number(taxValue) || 0;
  const totalPrice = Math.max(0, price * qty + tax * qty);

  return {
    quantity: qty,
    unitPrice: price,
    discountValue: savings,
    taxValue: tax,
    totalPrice,
  };
}

function resolveLineTotalPrice(item) {
  const qty = Number(item?.quantity) || 0;
  const unitPrice = Number(item?.unitPrice) || 0;
  const taxValue = Number(item?.taxValue) || 0;
  return Math.max(0, unitPrice * qty + taxValue * qty);
}

function computeSavingsPerUnit(mrp, unitPrice) {
  return Math.max(0, (Number(mrp) || 0) - (Number(unitPrice) || 0));
}

function computeShippingCharge(cart, configuredCharge = 0) {
  const itemCount = getCartCount(cart);
  if (itemCount <= 0) return 0;
  const charge = Number(configuredCharge);
  return Number.isFinite(charge) && charge >= 0 ? charge : 0;
}

function recalculateCartTotals(cart, configuredShippingCharge = 0) {
  let subTotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const item of cart.items ?? []) {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const discountValue = Number(item.discountValue) || 0;
    const taxValue = Number(item.taxValue) || 0;

    subTotal += unitPrice * qty;
    discountTotal += discountValue * qty;
    taxTotal += taxValue * qty;
    item.totalPrice = resolveLineTotalPrice(item);
  }

  const shippingCharge = computeShippingCharge(cart, configuredShippingCharge);

  cart.subTotal = subTotal;
  cart.discountTotal = discountTotal;
  cart.taxTotal = taxTotal;
  cart.shippingCharge = shippingCharge;
  cart.grandTotal = Math.max(0, subTotal + taxTotal + shippingCharge);
}

async function refreshCartTotals(cart) {
  const configuredShippingCharge = await getConfiguredShippingCharge();
  recalculateCartTotals(cart, configuredShippingCharge);
  return cart;
}

function findCartItemIndex(cart, productId, variantSku = "") {
  const productKey = String(productId);
  const skuKey = normalizeSku(variantSku);

  return (cart.items ?? []).findIndex(
    (item) => String(item.product) === productKey && normalizeSku(item.variantSku) === skuKey
  );
}

function findCartItem(cart, productId, variantSku = "") {
  const index = findCartItemIndex(cart, productId, variantSku);
  return index >= 0 ? cart.items[index] : null;
}

/** When variant is omitted on +/-, reuse the matching cart line (single line) or require variantSku */
function resolveCartLineOptions(cart, productId, options = {}) {
  const lines = getCartLinesForProduct(cart, productId);
  if (!lines.length) return options;

  const requestedSku = normalizeSku(options.variantSku);
  if (requestedSku) {
    const matchingLine = lines.find((line) => normalizeSku(line.variantSku) === requestedSku);
    if (matchingLine) return options;
  } else if (
    (Array.isArray(options.selectedAttributes) && options.selectedAttributes.length) ||
    options.size ||
    options.color ||
    options.combinationIndex !== undefined
  ) {
    return options;
  }

  if (lines.length === 1) {
    const line = lines[0];
    return {
      ...options,
      variantSku: line.variantSku ?? "",
      selectedAttributes: line.selectedAttributes?.length
        ? line.selectedAttributes
        : options.selectedAttributes,
    };
  }

  if (requestedSku) return options;

  throw new AppError(
    "variantSku is required when this product has multiple variants in cart",
    400
  );
}

async function persistCartTotals(userId) {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) return null;
  await refreshCartTotals(cart);
  await cart.save();
  return cart;
}

async function pruneUnavailableCartItems(userId) {
  const cart = await Cart.findOne({ user: userId }).select("items").lean();
  if (!cart?.items?.length) return;

  const productIds = [...new Set(cart.items.map((item) => String(item.product)))];
  const available = await Product.find({
    ...activePublicProductBaseFilter(),
    _id: { $in: productIds.map((id) => toObjectId(id)) },
  })
    .select("_id")
    .lean();

  const availableSet = new Set(available.map((row) => String(row._id)));
  const staleIds = productIds
    .filter((id) => !availableSet.has(id))
    .map((id) => toObjectId(id));

  if (!staleIds.length) return;

  await Cart.updateOne({ user: userId }, { $pull: { items: { product: { $in: staleIds } } } });
  await persistCartTotals(userId);
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

function computeTaxValue(product, unitPrice) {
  const taxValue = Number(product.taxValue) || 0;
  if (taxValue <= 0) return 0;
  if (product.taxType === "exclusive") {
    return Math.round((unitPrice * taxValue) / 100);
  }
  return 0;
}

function parseSetQuantity(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  const qty = Number(value);
  if (Number.isNaN(qty) || qty < 0) {
    throw new AppError("Quantity must be 0 or greater", 400);
  }
  return Math.floor(qty);
}

function resolveProductVendorKey(product) {
  if (!product?.addedById) return "";
  return `${String(product.role || "Admin").trim()}:${String(product.addedById)}`;
}

async function clearCartItemsFromOtherVendors(userId, cart, product) {
  if (!cart?.items?.length) {
    return { cleared: false };
  }

  const newVendorKey = resolveProductVendorKey(product);
  const productIds = [...new Set(cart.items.map((item) => item.product))];
  const existingProducts = await Product.find({
    _id: { $in: productIds },
  })
    .select("addedById role")
    .lean();

  const hasOtherVendor = existingProducts.some(
    (row) => resolveProductVendorKey(row) !== newVendorKey
  );

  if (!hasOtherVendor) {
    return { cleared: false };
  }

  await Cart.updateOne({ user: userId }, { $set: { items: [] } });
  await persistCartTotals(userId);
  return { cleared: true };
}

async function setProductCartQuantity(userId, productId, options = {}) {
  const product = await assertCartProduct(productId);
  const existingCart = await Cart.findOne({ user: userId }).select("items").lean();
  const resolvedOptions = resolveCartLineOptions(existingCart, productId, options);
  const variant = resolveCartVariant(product, resolvedOptions);
  const targetQty = parseSetQuantity(options.quantity, 1);
  const taxValue = computeTaxValue(product, variant.unitPrice);
  const productOid = product._id;
  const variantSku = normalizeSku(variant.variantSku);
  const savingsPerUnit = computeSavingsPerUnit(variant.mrp, variant.unitPrice);
  const lineTotals = calculateLineTotals(
    targetQty,
    variant.unitPrice,
    savingsPerUnit,
    taxValue
  );

  if (targetQty === 0) {
    await Cart.updateOne(
      { user: userId },
      { $pull: { items: { product: productOid, variantSku } } }
    );
    const cart = await persistCartTotals(userId);
    return {
      cart: cart ?? (await getOrCreateCart(userId)),
      item: null,
      product,
      variant,
      removed: true,
      isCreated: false,
      isUpdated: false,
      vendorCartCleared: false,
    };
  }

  const itemIndex = existingCart ? findCartItemIndex(existingCart, productOid, variantSku) : -1;

  assertVariantStockAvailable(product, variant, targetQty);

  let vendorCartCleared = false;
  if (itemIndex < 0) {
    const clearResult = await clearCartItemsFromOtherVendors(userId, existingCart, product);
    vendorCartCleared = clearResult.cleared;
  }

  if (itemIndex >= 0) {
    await Cart.updateOne(
      {
        user: userId,
        items: { $elemMatch: { product: productOid, variantSku } },
      },
      {
        $set: {
          "items.$.quantity": lineTotals.quantity,
          "items.$.unitPrice": lineTotals.unitPrice,
          "items.$.discountValue": lineTotals.discountValue,
          "items.$.taxValue": lineTotals.taxValue,
          "items.$.totalPrice": lineTotals.totalPrice,
          "items.$.productName": product.name,
          "items.$.selectedAttributes": variant.selectedAttributes,
        },
      }
    );

    const cart = await persistCartTotals(userId);
    return {
      cart,
      item: findCartItem(cart, productOid, variantSku),
      product,
      variant,
      removed: false,
      isCreated: false,
      isUpdated: true,
      vendorCartCleared: false,
    };
  }

  await Cart.findOneAndUpdate(
    { user: userId },
    {
      $push: {
        items: {
          product: productOid,
          variantSku,
          productName: product.name,
          selectedAttributes: variant.selectedAttributes,
          ...lineTotals,
          notes: "",
        },
      },
      $setOnInsert: { user: userId },
    },
    { upsert: true, new: false }
  );

  const cart = await persistCartTotals(userId);
  return {
    cart,
    item: findCartItem(cart, productOid, variantSku),
    product,
    variant,
    removed: false,
    isCreated: true,
    isUpdated: false,
    vendorCartCleared,
  };
}

/** @deprecated use setProductCartQuantity */
async function addProductToCart(userId, productId, options = {}) {
  return setProductCartQuantity(userId, productId, options);
}

async function changeCartItemQuantity(userId, productId, delta, options = {}) {
  if (!delta || delta === 0) {
    throw new AppError("Invalid quantity change", 400);
  }

  const product = await assertCartProduct(productId);
  const cart = await getOrCreateCart(userId);
  const resolvedOptions = resolveCartLineOptions(cart, productId, options);
  const variant = resolveCartVariant(product, resolvedOptions);
  const itemIndex = findCartItemIndex(cart, product._id, variant.variantSku);

  if (itemIndex < 0) {
    if (delta < 0) {
      throw new AppError("Product not found in cart", 404);
    }
    return addProductToCart(userId, productId, { ...resolvedOptions, quantity: delta });
  }

  const current = cart.items[itemIndex];
  const nextQty = current.quantity + delta;

  if (nextQty <= 0) {
    cart.items.splice(itemIndex, 1);
    await refreshCartTotals(cart);
    await cart.save();
    return { cart, item: null, product, variant, removed: true };
  }

  assertVariantStockAvailable(product, variant, nextQty);

  const taxValue = computeTaxValue(product, variant.unitPrice);
  const savingsPerUnit = computeSavingsPerUnit(variant.mrp, variant.unitPrice);
  Object.assign(
    current,
    calculateLineTotals(nextQty, variant.unitPrice, savingsPerUnit, taxValue)
  );

  await refreshCartTotals(cart);
  await cart.save();

  return {
    cart,
    item: cart.items[findCartItemIndex(cart, product._id, variant.variantSku)],
    product,
    variant,
    removed: false,
  };
}

async function removeCartItem(userId, productId, options = {}) {
  const product = await assertCartProduct(productId);
  const existingCart = await Cart.findOne({ user: userId }).select("items").lean();
  const resolvedOptions = resolveCartLineOptions(existingCart, productId, options);
  const variant = resolveCartVariant(product, resolvedOptions);
  const variantSku = normalizeSku(variant.variantSku);
  const itemIndex = existingCart ? findCartItemIndex(existingCart, productId, variantSku) : -1;

  if (itemIndex < 0) {
    throw new AppError("Product not found in cart", 404);
  }

  await Cart.updateOne(
    { user: userId },
    { $pull: { items: { product: product._id, variantSku } } }
  );

  return persistCartTotals(userId);
}

async function getCartItemQuantity(userId, productId, variantSku = "") {
  const cart = await Cart.findOne({ user: userId }).select("items").lean();
  if (!cart) return 0;

  const itemIndex = findCartItemIndex(cart, productId, variantSku);
  if (itemIndex < 0) return 0;
  return Number(cart.items[itemIndex].quantity) || 0;
}

function getCartCount(cart) {
  return (cart?.items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

async function hydrateCartItems(cart, baseUrl) {
  if (!cart?.items?.length) return [];

  const productIds = [...new Set(cart.items.map((item) => String(item.product)))];
  const products = await Product.find({
    ...activePublicProductBaseFilter(),
    _id: { $in: productIds.map((id) => toObjectId(id)) },
  })
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .lean();

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const vendorIds = [...new Set(products.map((product) => String(product.addedById)).filter(Boolean))];
  const vendors = await Vendor.find({
    _id: { $in: vendorIds },
    status: "active",
    approvalStatus: "approved",
    isOpen: { $ne: false },
  })
    .select("businessName shopLogo")
    .lean();
  const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));

  return cart.items
    .map((item) => {
      const product = productMap.get(String(item.product));
      if (!product) return null;

      const vendor = vendorMap.get(String(product.addedById));
      const unitPrice = Number(item.unitPrice) || 0;
      const totalPrice = resolveLineTotalPrice(item);

      return {
        productId: item.product,
        variantSku: item.variantSku ?? "",
        productName: item.productName || product.name,
        sku: item.sku || product.sku,
        quantity: item.quantity,
        unitPrice,
        unitPriceLabel: formatInrAmount(unitPrice),
        totalPrice,
        totalPriceLabel: formatInrAmount(totalPrice),
        thumbnail: toAbsoluteUploadUrl(product.thumbnail, baseUrl),
        selectedAttributes: item.selectedAttributes ?? [],
        vendor: vendor
          ? {
              _id: vendor._id,
              name: vendor.businessName,
              shopLogo: vendor.shopLogo ? toAbsoluteUploadUrl(vendor.shopLogo, baseUrl) : "",
            }
          : null,
      };
    })
    .filter(Boolean);
}

async function validateCartForCheckout(cart) {
  if (!cart?.items?.length) {
    throw new AppError("Cart is empty", 400);
  }

  const lines = [];

  for (const item of cart.items) {
    const product = await assertCartProduct(item.product);
    const variant = resolveCartVariant(product, { variantSku: item.variantSku });
    const qty = Number(item.quantity) || 0;

    if (qty < 1) {
      throw new AppError("Invalid cart item quantity", 400);
    }
    assertVariantStockAvailable(product, variant, qty, {
      productName: item.productName || product.name,
    });

    const taxValue = computeTaxValue(product, variant.unitPrice);
    const savingsPerUnit = computeSavingsPerUnit(variant.mrp, variant.unitPrice);
    const totals = calculateLineTotals(qty, variant.unitPrice, savingsPerUnit, taxValue);

    lines.push({
      product: product._id,
      name: item.productName || product.name,
      sku: variant.sku || product.sku,
      variantSku: variant.variantSku || "",
      quantity: totals.quantity,
      unitPrice: totals.unitPrice,
      discountValue: totals.discountValue,
      taxValue: totals.taxValue,
      totalPrice: totals.totalPrice,
      vendor:
        String(product.role || "") === "Vendor" && product.addedById
          ? product.addedById
          : null,
      selectedAttributes: item.selectedAttributes?.length
        ? item.selectedAttributes
        : variant.selectedAttributes,
      variantType: product.variantType,
    });
  }

  return lines;
}

function toCartSummary(cart, lineCount = null) {
  return {
    itemCount: getCartCount(cart),
    lineCount: lineCount ?? (cart.items ?? []).length,
    subTotal: cart.subTotal,
    subTotalLabel: formatInrAmount(cart.subTotal),
    discountTotal: cart.discountTotal,
    taxTotal: cart.taxTotal,
    shippingCost: cart.shippingCharge,
    shippingCostLabel: formatInrAmount(cart.shippingCharge),
    shippingCharge: cart.shippingCharge,
    shippingChargeLabel: formatInrAmount(cart.shippingCharge),
    grandTotal: cart.grandTotal,
    grandTotalLabel: formatInrAmount(cart.grandTotal),
  };
}

function toProductCartDetailLine(item) {
  const unitPrice = Number(item.unitPrice) || 0;
  const itemTotal = resolveLineTotalPrice(item);

  return {
    variantSku: item.variantSku ?? "",
    sku: item.sku ?? "",
    quantity: Number(item.quantity) || 0,
    unitPrice,
    unitPriceLabel: formatInrAmount(unitPrice),
    itemTotal,
    itemTotalLabel: formatInrAmount(itemTotal),
    selectedAttributes: item.selectedAttributes ?? [],
  };
}

function toProductCartDetail(items = []) {
  if (!items.length) {
    return {
      inCart: false,
      quantity: 0,
      itemTotal: 0,
      itemTotalLabel: formatInrAmount(0),
      items: [],
    };
  }

  const lines = items.map(toProductCartDetailLine);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const itemTotal = lines.reduce((sum, line) => sum + line.itemTotal, 0);
  const primary = lines[0];

  const detail = {
    inCart: true,
    quantity,
    itemTotal,
    itemTotalLabel: formatInrAmount(itemTotal),
    items: lines,
  };

  if (lines.length === 1) {
    detail.variantSku = primary.variantSku;
    detail.sku = primary.sku;
    detail.unitPrice = primary.unitPrice;
    detail.unitPriceLabel = primary.unitPriceLabel;
    detail.selectedAttributes = primary.selectedAttributes;
  }

  return detail;
}

function getCartLinesForProduct(cart, productId) {
  return (cart?.items ?? []).filter((item) => String(item.product) === String(productId));
}

async function buildProductCartDetailMap(userId, productIds = []) {
  const map = new Map();
  if (!userId || !productIds.length) return map;

  const cart = await Cart.findOne({ user: userId }).select("items").lean();
  if (!cart?.items?.length) return map;

  const productIdSet = new Set(productIds.map((id) => String(id)));
  const grouped = new Map();

  for (const item of cart.items) {
    const productId = String(item.product);
    if (!productIdSet.has(productId)) continue;
    if (!grouped.has(productId)) grouped.set(productId, []);
    grouped.get(productId).push(item);
  }

  for (const [productId, items] of grouped) {
    const detail = toProductCartDetail(items);
    if (detail) map.set(productId, detail);
  }

  return map;
}

function toCartActionPayload({
  cart,
  item,
  product,
  variant,
  removed = false,
  vendorCartCleared = false,
}) {
  const cartCount = getCartCount(cart);
  const productCart = toProductCartDetail(getCartLinesForProduct(cart, product._id));

  const totals = {
    cartCount,
    subTotal: cart.subTotal,
    subTotalLabel: formatInrAmount(cart.subTotal),
    shippingCost: cart.shippingCharge,
    shippingCostLabel: formatInrAmount(cart.shippingCharge),
    grandTotal: cart.grandTotal,
    grandTotalLabel: formatInrAmount(cart.grandTotal),
  };

  if (removed || !item) {
    return {
      productId: String(product._id),
      variantSku: variant?.variantSku ?? "",
      quantity: productCart.quantity,
      inCart: productCart.inCart,
      itemTotal: productCart.itemTotal,
      itemTotalLabel: productCart.itemTotalLabel,
      items: productCart.items,
      vendorCartCleared: false,
      ...totals,
    };
  }

  return {
    productId: String(product._id),
    variantSku: item.variantSku ?? "",
    productName: item.productName || product.name,
    sku: item.sku || variant?.sku || product.sku,
    quantity: item.quantity,
    inCart: productCart.inCart,
    unitPrice: item.unitPrice,
    unitPriceLabel: formatInrAmount(item.unitPrice),
    itemTotal: item.totalPrice,
    itemTotalLabel: formatInrAmount(item.totalPrice),
    selectedAttributes: item.selectedAttributes ?? [],
    items: productCart.items,
    productQuantity: productCart.quantity,
    productItemTotal: productCart.itemTotal,
    productItemTotalLabel: productCart.itemTotalLabel,
    vendorCartCleared: !!vendorCartCleared,
    ...totals,
  };
}

module.exports = {
  setProductCartQuantity,
  addProductToCart,
  changeCartItemQuantity,
  removeCartItem,
  getOrCreateCart,
  getCartItemQuantity,
  getCartCount,
  hydrateCartItems,
  toCartSummary,
  toCartActionPayload,
  toProductCartDetail,
  getCartLinesForProduct,
  buildProductCartDetailMap,
  refreshCartTotals,
  pruneUnavailableCartItems,
  validateCartForCheckout,
  recalculateCartTotals,
  assertCartProduct,
  resolveCartVariant,
  resolveCartLineOptions,
  combinationMatchesAttributes,
  normalizeSku,
};
