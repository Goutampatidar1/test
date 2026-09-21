const mongoose = require("mongoose");
const Order = require("../models/other/order");
const Product = require("../models/other/product");
const Vendor = require("../models/entity/vendor");
const User = require("../models/entity/user");
const AppError = require("./AppError");
const { formatInrAmount } = require("./publicProductList");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { resolveInvoiceUrls } = require("./ecomInvoiceUrls");
const { restoreProductStock } = require("./ecomCheckout");
const { queueOrderStatusUpdatedNotification } = require("./ecomOrderNotifications");
const { cancelEcomTransactionForOrder } = require("./ecomTransaction");
const {
  getDeliveryOtpForOrder,
  cancelDeliveryOtpForOrder,
  toUserDeliveryOtpPayload,
} = require("./deliveryOrderOtp");
const {
  shouldRefundOrderToWallet,
  refundEcomOrderToWallet,
  getUserWalletBalance,
  isCodPaymentMethod,
} = require("./userWallet");
const { activePublicProductBaseFilter } = require("./publicProductList");
const { getUserRatingsForProducts } = require("./productRating");
const { formatDateTimeLabel, toIstIsoString } = require("./dateOnly");
const { mapCombinationAttributes, formatSimpleCombination } = require("./productVariants");

const NON_CANCELLABLE_ORDER_STATUSES = new Set(["shipped", "delivered", "cancelled", "refunded"]);

const PAYMENT_METHOD_LABELS = {
  cod: "Cash On Delivery",
  online: "Online Payment",
  wallet: "Wallet",
};

const TRACKING_STEPS = [
  {
    key: "order_placed",
    title: "Order Placed",
    description: "Your order has been placed successfully.",
  },
  {
    key: "payment_done",
    title: "Payment Done",
    description: "Payment has been confirmed for your order.",
  },
  {
    key: "processing",
    title: "Processing",
    description: "We are preparing your order for dispatch.",
  },
  {
    key: "dispatched",
    title: "Dispatched",
    description: "Your order has been dispatched.",
  },
  {
    key: "delivered",
    title: "Delivered",
    description: "Your order has been delivered.",
  },
];

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function formatOrderDisplayId(order) {
  const raw = String(order._id || "");
  return `OID${raw.slice(-4).toUpperCase()}`;
}

function formatOrderPlacedLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const hours = Number(get("hour")) || 12;
  const minutes = Number(get("minute")) || 0;
  const ampm = String(get("dayPeriod") || "am").toLowerCase().replace(/\./g, "");
  const minutePart = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";

  return `${get("day")} ${get("month")} ${get("year")} | ${hours}${minutePart}${ampm}`;
}

function getActiveTrackingIndex(orderStatus) {
  switch (String(orderStatus || "").toLowerCase()) {
    case "pending":
    case "confirmed":
    case "processing":
      return 2;
    case "shipped":
      return 3;
    case "delivered":
      return 4;
    case "cancelled":
    case "refunded":
      return -1;
    default:
      return 2;
  }
}

function buildTrackingTimeline(order) {
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const paymentMethod = String(order.paymentMethod || "cod").toLowerCase();
  const activeIndex = getActiveTrackingIndex(orderStatus);
  const isCancelled = activeIndex === -1;

  if (isCancelled) {
    const reason = String(order.cancellationReason || "").trim();
    const cancelledDescription =
      orderStatus === "refunded"
        ? reason
          ? `Order was refunded. Reason: ${reason}`
          : "Your order has been refunded."
        : reason
          ? `Your order has been cancelled. Reason: ${reason}`
          : "Your order has been cancelled.";

    return [
      {
        key: "order_placed",
        title: "Order Placed",
        description: "Your order has been placed successfully.",
        state: "completed",
        isCompleted: true,
        isCurrent: false,
        isPending: false,
        isCancelled: false,
      },
      {
        key: "order_cancelled",
        title: orderStatus === "refunded" ? "Order Refunded" : "Order Cancelled",
        description: cancelledDescription,
        state: "cancelled",
        isCompleted: false,
        isCurrent: true,
        isPending: false,
        isCancelled: true,
      },
    ];
  }

  return TRACKING_STEPS.map((step, index) => {
    let state = "pending";

    if (index < activeIndex) {
      state = "completed";
    } else if (index === activeIndex) {
      state = "current";
    }

    let description = step.description;
    if (step.key === "payment_done" && paymentMethod === "cod") {
      description = "Cash on delivery selected.";
    }

    return {
      ...step,
      state,
      isCompleted: state === "completed",
      isCurrent: state === "current",
      isPending: state === "pending",
      isCancelled: false,
      description,
    };
  });
}

function canCancelOrder(order) {
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const paymentMethod = String(order.paymentMethod || "").toLowerCase();
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();

  if (NON_CANCELLABLE_ORDER_STATUSES.has(orderStatus)) {
    return false;
  }

  // COD: delivered or payment collected on delivery — no cancellation
  if (paymentMethod === "cod") {
    if (orderStatus === "delivered" || paymentStatus === "paid") {
      return false;
    }
  }

  return true;
}

function getCancelBlockReason(order) {
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const paymentMethod = String(order.paymentMethod || "").toLowerCase();
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();

  if (orderStatus === "cancelled") {
    return "This order is already cancelled.";
  }
  if (orderStatus === "refunded") {
    return "This order has been refunded.";
  }
  if (orderStatus === "delivered") {
    return "Delivered orders cannot be cancelled.";
  }
  if (orderStatus === "shipped") {
    return "Shipped orders cannot be cancelled.";
  }
  if (paymentMethod === "cod" && paymentStatus === "paid") {
    return "Cash on delivery payment is complete. This order cannot be cancelled.";
  }

  return "";
}

async function loadUserOrder(userId, orderId) {
  const order = await Order.findOne({
    _id: toObjectId(orderId),
    user: toObjectId(userId),
  }).lean();

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  return order;
}

async function hydrateOrderProducts(order) {
  const productIds = [...new Set((order.items ?? []).map((item) => String(item.product)))];
  if (!productIds.length) return new Map();

  const products = await Product.find({
    _id: { $in: productIds.map((id) => toObjectId(id)) },
  })
    .select("_id thumbnail addedById variantType sku combinations discountType discountValue")
    .populate("combinations.attributes.attributeTitle", "title status")
    .populate("combinations.attributes.attributeValue", "value colorCode status")
    .lean();

  return new Map(products.map((product) => [String(product._id), product]));
}

async function hydratePrimaryVendor(order, productMap) {
  const firstItem = order.items?.[0];
  if (!firstItem) return null;

  const product = productMap.get(String(firstItem.product));
  const vendorId = product?.addedById;
  if (!vendorId) return null;

  const vendor = await Vendor.findOne({
    _id: vendorId,
    status: "active",
    approvalStatus: "approved",
  })
    .select("businessName city state businessAddress shopLogo")
    .lean();

  if (!vendor) return null;

  const productCount = await Product.countDocuments(
    activePublicProductBaseFilter({ addedById: vendor._id })
  );

  const location = [vendor.city, vendor.state].filter(Boolean).join(", ") || vendor.businessAddress || "";

  return {
    _id: vendor._id,
    name: vendor.businessName,
    location,
    productCount,
    productCountLabel: `${productCount} Products`,
    shopLogo: vendor.shopLogo || "",
  };
}

function buildAddressSection(order) {
  const snap =
    order.addressSnapshot && typeof order.addressSnapshot === "object"
      ? order.addressSnapshot
      : {};

  const fullName = snap.fullName || snap.name || "";
  const pincode = snap.pincode || "";
  const label = snap.label || "home";
  const labelDisplay = snap.labelDisplay || (label === "home" ? "Home" : label === "office" ? "Office" : "Other");
  const addressLine =
    snap.fullAddress ||
    snap.addressLine ||
    [snap.houseNo, snap.buildingName, snap.roadName, snap.areaColony, snap.landmark, snap.city, snap.state, snap.pincode]
      .filter(Boolean)
      .join(", ");

  return {
    fullName,
    pincode,
    label,
    labelDisplay,
    phone: snap.phone || snap.mobileNumber || "",
    addressLine,
    fullAddress: addressLine,
  };
}

function buildRefundDetail(order, refundResult = null) {
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  const unpaidCod = isCodPaymentMethod(order.paymentMethod);
  const refundedToWallet = Boolean(
    !unpaidCod && (refundResult?.refunded || paymentStatus === "refunded")
  );
  const refundAmount = unpaidCod
    ? 0
    : normalizeRefundAmount(
        refundResult?.refundAmount ?? (refundedToWallet ? order.grandTotal : 0)
      );

  return {
    refundedToWallet,
    alreadyRefunded: Boolean(!unpaidCod && refundResult?.alreadyRefunded),
    refundAmount,
    refundAmountLabel: formatInrAmount(refundAmount),
    walletBalance:
      refundResult?.walletBalance != null
        ? normalizeRefundAmount(refundResult.walletBalance)
        : null,
    walletBalanceLabel:
      refundResult?.walletBalance != null
        ? formatInrAmount(refundResult.walletBalance)
        : null,
  };
}

function normalizeRefundAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

function buildPaymentDetail(order) {
  return {
    subTotal: order.subTotal,
    subTotalLabel: formatInrAmount(order.subTotal),
    discountTotal: order.discountTotal,
    taxTotal: order.taxTotal,
    shippingCost: order.shippingCharge,
    shippingCostLabel: formatInrAmount(order.shippingCharge),
    total: order.grandTotal,
    totalLabel: formatInrAmount(order.grandTotal),
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
}

function resolveVariantSkuFromItem(item, product) {
  const fromItem = String(item.variantSku || "").trim();
  if (fromItem) return fromItem;

  if (product?.variantType === "multi") {
    const fromSku = String(item.sku || "").trim();
    if (fromSku && fromSku !== String(product.sku || "").trim()) {
      return fromSku;
    }
  }

  return "";
}

function findProductCombination(product, variantSku) {
  const normalized = String(variantSku || "").trim();
  if (!normalized || !product?.combinations?.length) return null;

  return product.combinations.find((combo) => combo.sku === normalized) ?? null;
}

function buildVariantLabel(attributes = []) {
  if (!attributes.length) return "";
  return attributes
    .map((attr) => attr.label || attr.value)
    .filter(Boolean)
    .join(" / ");
}

function resolveOrderItemVariant(item, product, baseUrl) {
  const emptyVariant = {
    variantSku: item.variantSku || "",
    sku: item.sku || "",
    variantType: product?.variantType || "single",
    attributes: [],
    selectedAttributes: [],
    variantLabel: "",
    size: null,
    color: null,
    colorCode: "",
    images: [],
  };

  if (!product) return emptyVariant;

  const variantType = product.variantType || "single";
  const variantSku = resolveVariantSkuFromItem(item, product);

  if (variantType !== "multi" || !variantSku) {
    return {
      ...emptyVariant,
      variantSku: variantSku || product.sku || "",
      sku: item.sku || product.sku || "",
      variantType,
    };
  }

  const combo = findProductCombination(product, variantSku);
  if (!combo) {
    return {
      ...emptyVariant,
      variantSku,
      sku: item.sku || variantSku,
      variantType,
    };
  }

  const attributes = mapCombinationAttributes(combo);
  const simple = formatSimpleCombination(combo, product, baseUrl);

  return {
    variantSku,
    sku: combo.sku,
    variantType,
    attributes,
    selectedAttributes: attributes.map((attr) => ({
      titleId: attr.titleId,
      title: attr.title,
      valueId: attr.valueId,
      value: attr.value,
      label: attr.label,
      colorCode: attr.colorCode || "",
      type: attr.type,
    })),
    variantLabel: buildVariantLabel(attributes),
    size: simple.size,
    color: simple.color,
    colorCode: simple.colorCode,
    images: simple.images,
  };
}

function buildOrderItems(order, productMap, baseUrl, myRatingMap = new Map()) {
  return (order.items ?? []).map((item) => {
    const product = productMap.get(String(item.product));
    const variant = resolveOrderItemVariant(item, product, baseUrl);
    const thumbnail =
      variant.images?.[0] ||
      (product?.thumbnail ? toAbsoluteUploadUrl(product.thumbnail, baseUrl) : "");
    const savedRating = myRatingMap.get(String(item.product));

    return {
      productId: item.product,
      productName: item.name,
      sku: item.sku,
      variantSku: variant.variantSku,
      variantType: variant.variantType,
      variantLabel: variant.variantLabel,
      selectedAttributes: variant.selectedAttributes,
      variant,
      quantity: item.quantity,
      quantityLabel: `Qty - ${item.quantity}`,
      unitPrice: item.unitPrice,
      unitPriceLabel: formatInrAmount(item.unitPrice),
      totalPrice: item.totalPrice,
      totalPriceLabel: formatInrAmount(item.totalPrice),
      thumbnail,
      variantImage: variant.images?.[0] || "",
      myRating: savedRating?.rating ?? null,
      myReview: savedRating?.review ?? "",
      hasReview: Boolean(savedRating),
    };
  });
}

function toOrderDetailPayload(order, options = {}) {
  const {
    productMap = new Map(),
    vendor = null,
    baseUrl = "",
    refundResult = null,
    deliveryOtpRecord = null,
    myRatingMap = new Map(),
  } = options;
  const address = buildAddressSection(order);
  const paymentDetail = buildPaymentDetail(order);
  const refund = buildRefundDetail(order, refundResult);
  const tracking = buildTrackingTimeline(order);
  const invoice = resolveInvoiceUrls(order, baseUrl);

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderDisplayId: formatOrderDisplayId(order),
    placedAt: order.placedAt ?? order.createdAt,
    placedAtLabel: formatOrderPlacedLabel(order.placedAt ?? order.createdAt),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
    canCancel: canCancelOrder(order),
    cancelBlockReason: getCancelBlockReason(order),
    canDownloadInvoice: true,
    invoice,
    invoicePdfUrl: invoice.invoicePdfUrl,
    invoiceUrl: invoice.invoiceUrl,
    invoiceHtmlUrl: invoice.invoiceHtmlUrl,
    cancellationReason: order.cancellationReason || "",
    cancelledAt: order.cancelledAt ? toIstIsoString(order.cancelledAt) : null,
    cancelledAtLabel: order.cancelledAt ? formatDateTimeLabel(order.cancelledAt) : "",
    address,
    items: buildOrderItems(order, productMap, baseUrl, myRatingMap),
    tracking,
    trackOrder: tracking,
    vendor,
    paymentDetail,
    refund,
    summary: {
      subTotal: order.subTotal,
      subTotalLabel: formatInrAmount(order.subTotal),
      shippingCost: order.shippingCharge,
      shippingCostLabel: formatInrAmount(order.shippingCharge),
      totalAmount: order.grandTotal,
      totalAmountLabel: formatInrAmount(order.grandTotal),
    },
    notes: order.notes || "",
    deliveryOtp: toUserDeliveryOtpPayload(deliveryOtpRecord, order),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function getOrderDetail(userId, orderId, baseUrl) {
  const order = await loadUserOrder(userId, orderId);
  const productMap = await hydrateOrderProducts(order);
  const vendor = await hydratePrimaryVendor(order, productMap);
  const deliveryOtpRecord = await getDeliveryOtpForOrder(order._id);
  const productIds = (order.items ?? []).map((item) => item.product).filter(Boolean);
  const myRatingMap = await getUserRatingsForProducts(userId, productIds);

  let refundResult = null;
  if (String(order.paymentStatus || "").toLowerCase() === "refunded" && !isCodPaymentMethod(order.paymentMethod)) {
    const walletBalance = await getUserWalletBalance(userId);
    refundResult = {
      refunded: true,
      alreadyRefunded: true,
      refundAmount: order.grandTotal,
      walletBalance,
    };
  }

  return toOrderDetailPayload(order, {
    productMap,
    vendor,
    baseUrl,
    refundResult,
    deliveryOtpRecord,
    myRatingMap,
  });
}

async function restoreOrderItemStock(item) {
  const product = await Product.findById(item.product).select("sku variantType").lean();
  let variantSku = item.variantSku || "";

  if (!variantSku && product?.variantType === "multi" && item.sku) {
    variantSku = item.sku;
  }

  await restoreProductStock({
    product: item.product,
    variantSku,
    quantity: item.quantity,
    name: item.name,
  });
}

async function cancelUserOrder(userId, orderId, reason) {
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) {
    throw new AppError("Cancellation reason is required", 400);
  }

  const order = await Order.findOne({
    _id: toObjectId(orderId),
    user: toObjectId(userId),
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (!canCancelOrder(order)) {
    const reason = getCancelBlockReason(order);
    throw new AppError(reason || "This order cannot be cancelled", 400);
  }

  const previousStatus = order.orderStatus;
  const unpaidCod = isCodPaymentMethod(order.paymentMethod);

  for (const item of order.items ?? []) {
    await restoreOrderItemStock(item);
  }

  if (unpaidCod) {
    console.log(
      `[cod-cancel] skip wallet refund order=${order.orderNumber} method=${order.paymentMethod} paymentStatus=${order.paymentStatus}`
    );
  }

  const needsWalletRefund = !unpaidCod && (await shouldRefundOrderToWallet(order));
  let refundResult = {
    refunded: false,
    alreadyRefunded: false,
    refundAmount: 0,
    walletBalance: null,
  };

  if (needsWalletRefund) {
    refundResult = await refundEcomOrderToWallet(order, normalizedReason);
  }

  order.orderStatus = "cancelled";
  order.cancellationReason = normalizedReason;
  order.cancelledAt = new Date();

  if (!unpaidCod && (refundResult.refunded || refundResult.alreadyRefunded)) {
    order.paymentStatus = "refunded";
  } else if (unpaidCod) {
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
      order.paymentStatus = "failed";
    }
  } else if (order.paymentStatus === "pending") {
    order.paymentStatus = "failed";
  }

  await order.save();
  await cancelDeliveryOtpForOrder(order._id).catch(() => {});
  await cancelEcomTransactionForOrder(order, normalizedReason, {
    refunded: Boolean(!unpaidCod && (refundResult.refunded || refundResult.alreadyRefunded)),
  });

  queueOrderStatusUpdatedNotification(order.toObject(), {
    previousStatus,
    newStatus: order.orderStatus,
    source: "user",
  });

  return {
    order: order.toObject(),
    refund: refundResult,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInvoicePayload(order, user, baseUrl) {
  const address = buildAddressSection(order);
  const paymentDetail = buildPaymentDetail(order);
  const items = (order.items ?? []).map((item) => ({
    productName: item.name,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitPriceLabel: formatInrAmount(item.unitPrice),
    totalPrice: item.totalPrice,
    totalPriceLabel: formatInrAmount(item.totalPrice),
  }));

  const itemRows = items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.productName)}</td>
        <td>${escapeHtml(item.sku || "—")}</td>
        <td style="text-align:right">${escapeHtml(item.quantity)}</td>
        <td style="text-align:right">${escapeHtml(item.unitPriceLabel)}</td>
        <td style="text-align:right">${escapeHtml(item.totalPriceLabel)}</td>
      </tr>`
    )
    .join("");

  const invoiceHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Invoice ${escapeHtml(order.orderNumber)}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; color: #111827; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 1.35rem; margin: 0 0 4px; }
    .tag { color: #6b7280; margin-bottom: 20px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-size: 0.875rem; margin-bottom: 20px; padding: 14px; background: #f9fafb; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; }
    .totals { margin-top: 18px; text-align: right; }
    .grand { font-size: 1.1rem; font-weight: 700; margin-top: 8px; padding-top: 8px; border-top: 2px solid #111827; }
  </style>
</head>
<body>
  <h1>Invoice</h1>
  <p class="tag">E-commerce order · ${escapeHtml(order.orderNumber)}</p>
  <div class="meta">
    <div><strong>Bill to</strong><br/>${escapeHtml(user?.name || address.fullName || "—")}</div>
    <div><strong>Contact</strong><br/>${escapeHtml(user?.phone || address.phone || "—")}</div>
    <div><strong>Order status</strong><br/>${escapeHtml(order.orderStatus)}</div>
    <div><strong>Payment</strong><br/>${escapeHtml(order.paymentStatus)} · ${escapeHtml(paymentDetail.paymentMethodLabel)}</div>
    <div><strong>Date</strong><br/>${escapeHtml(formatOrderPlacedLabel(order.placedAt ?? order.createdAt))}</div>
    <div><strong>Address</strong><br/>${escapeHtml(address.fullAddress || "—")}</div>
  </div>
  <table>
    <thead>
      <tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div>Subtotal: <strong>${escapeHtml(paymentDetail.subTotalLabel)}</strong></div>
    <div>Shipping: <strong>${escapeHtml(paymentDetail.shippingCostLabel)}</strong></div>
    <div class="grand">Grand total: ${escapeHtml(paymentDetail.totalLabel)}</div>
  </div>
</body>
</html>`;

  return {
    invoiceNumber: order.orderNumber,
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    orderDisplayId: formatOrderDisplayId(order),
    placedAt: order.placedAt ?? order.createdAt,
    placedAtLabel: formatOrderPlacedLabel(order.placedAt ?? order.createdAt),
    billTo: {
      name: user?.name || address.fullName || "",
      phone: user?.phone || address.phone || "",
      email: user?.email || "",
      address: address.fullAddress || "",
    },
    items,
    paymentDetail,
    summary: {
      subTotal: order.subTotal,
      subTotalLabel: formatInrAmount(order.subTotal),
      shippingCost: order.shippingCharge,
      shippingCostLabel: formatInrAmount(order.shippingCharge),
      totalAmount: order.grandTotal,
      totalAmountLabel: formatInrAmount(order.grandTotal),
    },
    invoiceHtml,
    invoicePdf: order.invoicePdf || "",
    invoicePdfUrl: order.invoicePdf ? toAbsoluteUploadUrl(order.invoicePdf, baseUrl) : "",
    invoiceUrl: baseUrl ? `${baseUrl}/api/user/order-invoice/${order._id}` : "",
    invoiceHtmlUrl: baseUrl
      ? `${baseUrl}/api/user/order-invoice/${order._id}?format=html`
      : "",
  };
}

async function getOrderInvoice(userId, orderId, baseUrl) {
  const order = await loadUserOrder(userId, orderId);
  const user = await User.findById(userId).select("name phone email").lean();
  return buildInvoicePayload(order, user, baseUrl);
}

module.exports = {
  getOrderDetail,
  cancelUserOrder,
  getOrderInvoice,
  buildInvoicePayload,
  canCancelOrder,
  getCancelBlockReason,
  toOrderDetailPayload,
  buildTrackingTimeline,
};
