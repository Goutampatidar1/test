const Order = require("../models/other/order");
const Product = require("../models/other/product");
const Cart = require("../models/other/cart");
const Transaction = require("../models/other/transaction");
const AppError = require("./AppError");
const { getUserShippingAddress, toShippingAddressItem } = require("./shippingAddress");
const { getOrCreateCart, refreshCartTotals, validateCartForCheckout } = require("./cart");
const { formatInrAmount } = require("./publicProductList");
const { resolveInvoiceUrls } = require("./ecomInvoiceUrls");
const { createEcomTransactionForOrder } = require("./ecomTransaction");
const { buildVendorFulfillmentsFromItems } = require("./ecomVendorFulfillment");
const { assertTotalAmount } = require("./venueBooking");
const {
  getPaymentMethodsConfig,
  isPaymentMethodEnabled,
} = require("./appCommerceSettings");
const {
  getUserWalletBalance,
  debitUserWallet,
  creditUserWallet,
  createWalletPaymentForOrder,
} = require("./userWallet");
const { queueOrderPlacedNotification } = require("./ecomOrderNotifications");
const {
  createDeliveryOtpForOrder,
  toUserDeliveryOtpPayload,
  cancelDeliveryOtpForOrder,
} = require("./deliveryOrderOtp");
const {
  createRazorpayOrder,
  verifyRazorpayCheckoutPayment,
} = require("./razorpay");
const {
  readGatewayPaymentId,
  isVenuePaymentConfirmed,
} = require("./venueTransaction");

const PAYMENT_METHOD_LABELS = {
  cod: "Cash On Delivery",
  online: "Online Payment",
  wallet: "Wallet",
};

function generateEcomOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EO-${ts}-${rnd}`;
}

function normalizePaymentMethod(value) {
  const method = String(value || "cod").trim().toLowerCase();
  if (!["cod", "online", "wallet"].includes(method)) {
    throw new AppError("Invalid paymentMethod. Use cod, online, or wallet", 400);
  }
  return method;
}

function readRazorpayOrderId(body = {}) {
  return String(
    body.gatewayOrderId ??
      body.gateway_order_id ??
      body.razorpay_order_id ??
      body.razorpayOrderId ??
      ""
  ).trim();
}

function readRazorpaySignature(body = {}) {
  return String(body.razorpay_signature ?? body.razorpaySignature ?? body.signature ?? "").trim();
}

async function assertPaymentMethodAllowed(paymentMethod) {
  const methods = await getPaymentMethodsConfig();
  if (!isPaymentMethodEnabled(methods, paymentMethod)) {
    if (paymentMethod === "online") {
      throw new AppError(
        "Online payment is currently unavailable. Enable Online in Admin → App Settings → Payment methods.",
        400
      );
    }
    if (paymentMethod === "wallet") {
      throw new AppError("Wallet payment is currently unavailable", 400);
    }
    throw new AppError("Cash On Delivery is currently unavailable", 400);
  }
}

function withOnlinePaymentFields(payload, razorpayOrder, { requiresPayment }) {
  if (!razorpayOrder) {
    return {
      ...payload,
      requiresPayment: Boolean(requiresPayment),
    };
  }

  return {
    ...payload,
    requiresPayment: Boolean(requiresPayment),
    keyId: razorpayOrder.keyId,
    razorpayOrderId: razorpayOrder.orderId,
    razorpay: {
      keyId: razorpayOrder.keyId,
      orderId: razorpayOrder.orderId,
      amount: razorpayOrder.amount,
      amountPaise: razorpayOrder.amountPaise,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: razorpayOrder.status,
    },
  };
}

async function decrementProductStock(line) {
  if (line.variantSku) {
    const result = await Product.updateOne(
      {
        _id: line.product,
        combinations: {
          $elemMatch: { sku: line.variantSku, stock: { $gte: line.quantity } },
        },
      },
      { $inc: { "combinations.$[combo].stock": -line.quantity } },
      {
        arrayFilters: [{ "combo.sku": line.variantSku }],
      }
    );

    if (result.modifiedCount !== 1) {
      throw new AppError(`Insufficient stock for ${line.name}`, 400);
    }
    return;
  }

  const result = await Product.updateOne(
    { _id: line.product, stock: { $gte: line.quantity } },
    { $inc: { stock: -line.quantity } }
  );

  if (result.modifiedCount !== 1) {
    throw new AppError(`Insufficient stock for ${line.name}`, 400);
  }
}

async function restoreProductStock(line) {
  if (line.variantSku) {
    await Product.updateOne(
      { _id: line.product, "combinations.sku": line.variantSku },
      { $inc: { "combinations.$[combo].stock": line.quantity } },
      { arrayFilters: [{ "combo.sku": line.variantSku }] }
    );
    return;
  }

  await Product.updateOne({ _id: line.product }, { $inc: { stock: line.quantity } });
}

async function restoreDecrementedStock(lines) {
  for (const line of lines) {
    try {
      await restoreProductStock(line);
    } catch {
      // best-effort rollback for local/dev without replica-set transactions
    }
  }
}

function buildOrderItems(lines) {
  return lines.map((line) => ({
    product: line.product,
    name: line.name,
    sku: line.sku,
    variantSku: line.variantSku || "",
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountValue: line.discountValue,
    taxValue: line.taxValue,
    totalPrice: line.totalPrice,
    ...(line.vendor ? { vendor: line.vendor } : {}),
  }));
}

async function buildAddressSnapshot(addressRow) {
  const address = await toShippingAddressItem(addressRow);
  return {
    addressId: address._id,
    ...address,
  };
}

function buildCustomerSnapshot(userDoc, addressSnapshot) {
  const user = userDoc && typeof userDoc.toObject === "function" ? userDoc.toObject() : userDoc;

  return {
    userId: user?._id ?? null,
    name: user?.name || addressSnapshot?.fullName || "",
    phone: user?.phone || addressSnapshot?.phone || addressSnapshot?.mobileNumber || "",
    email: user?.email || "",
  };
}

function toCheckoutOrderPayload(order, addressSnapshot, transaction, customer, extras = {}) {
  const paymentMethod = String(order.paymentMethod || "cod").toLowerCase();
  const invoice = extras.invoice || resolveInvoiceUrls(order, extras.baseUrl || "");

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    customer,
    placedBy: customer,
    paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    address: addressSnapshot,
    invoice,
    invoicePdfUrl: invoice.invoicePdfUrl || "",
    invoiceUrl: invoice.invoiceUrl || "",
    invoiceHtmlUrl: invoice.invoiceHtmlUrl || "",
    items: order.items.map((item) => ({
      productId: item.product,
      productName: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitPriceLabel: formatInrAmount(item.unitPrice),
      totalPrice: item.totalPrice,
      totalPriceLabel: formatInrAmount(item.totalPrice),
    })),
    subTotal: order.subTotal,
    subTotalLabel: formatInrAmount(order.subTotal),
    discountTotal: order.discountTotal,
    taxTotal: order.taxTotal,
    shippingCost: order.shippingCharge,
    shippingCostLabel: formatInrAmount(order.shippingCharge),
    totalAmount: order.grandTotal,
    totalAmountLabel: formatInrAmount(order.grandTotal),
    summary: {
      itemCount: order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      lineCount: order.items.length,
      subTotal: order.subTotal,
      subTotalLabel: formatInrAmount(order.subTotal),
      discountTotal: order.discountTotal,
      taxTotal: order.taxTotal,
      shippingCost: order.shippingCharge,
      shippingCostLabel: formatInrAmount(order.shippingCharge),
      shippingCharge: order.shippingCharge,
      shippingChargeLabel: formatInrAmount(order.shippingCharge),
      grandTotal: order.grandTotal,
      grandTotalLabel: formatInrAmount(order.grandTotal),
    },
    transaction: transaction
      ? {
          _id: transaction._id,
          transactionId: transaction.transactionId,
          status: transaction.status,
          amount: transaction.amount,
          amountLabel: formatInrAmount(transaction.amount),
          paymentMethod: transaction.paymentMethod,
        }
      : null,
    walletTransaction: extras.walletTransaction
      ? {
          _id: extras.walletTransaction._id,
          transactionId: extras.walletTransaction.transactionId,
          orderId: extras.walletTransaction.order ?? order._id,
          amount: extras.walletTransaction.amount,
          amountLabel: formatInrAmount(extras.walletTransaction.amount),
          type: extras.walletTransaction.type,
          status: extras.walletTransaction.status,
        }
      : null,
    walletBalance:
      extras.walletBalance != null ? extras.walletBalance : undefined,
    walletBalanceLabel:
      extras.walletBalance != null ? formatInrAmount(extras.walletBalance) : undefined,
    placedAt: order.placedAt,
    deliveryOtp: extras.deliveryOtp ?? null,
  };
}

async function placeCheckoutOrder(userId, body = {}, options = {}) {
  const paymentMethod = normalizePaymentMethod(body.paymentMethod);
  await assertPaymentMethodAllowed(paymentMethod);

  const addressId = body.addressId ?? body.shippingAddressId ?? body._id;
  if (!addressId) {
    throw new AppError("addressId is required", 400);
  }

  const addressRow = await getUserShippingAddress(userId, addressId);
  const addressSnapshot = await buildAddressSnapshot(addressRow);
  if (!addressSnapshot.ecomAvailable) {
    throw new AppError(
      addressSnapshot.ecomUnavailableReason ||
        "E-commerce is not available for this delivery address.",
      400
    );
  }
  const customer = buildCustomerSnapshot(options.user, addressSnapshot);
  const notes = String(body.notes || "").trim();

  const cart = await getOrCreateCart(userId);
  await refreshCartTotals(cart);

  if (!cart.items?.length) {
    throw new AppError("Cart is empty", 400);
  }

  const checkoutLines = await validateCartForCheckout(cart);
  const orderItems = buildOrderItems(checkoutLines);

  let subTotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const line of checkoutLines) {
    subTotal += line.unitPrice * line.quantity;
    discountTotal += line.discountValue * line.quantity;
    taxTotal += line.taxValue * line.quantity;
  }

  const shippingCharge = Number(cart.shippingCharge) || 0;
  const grandTotal = Math.max(0, subTotal + taxTotal + shippingCharge);

  const clientTotal = body.totalAmount ?? body.grandTotal ?? body.amount;
  assertTotalAmount(clientTotal, grandTotal);

  const isWalletPayment = paymentMethod === "wallet";
  const isOnlinePayment = paymentMethod === "online";
  const onlineAlreadyPaid = isOnlinePayment && isVenuePaymentConfirmed(body);

  if (isWalletPayment) {
    const walletBalance = await getUserWalletBalance(userId);
    if (walletBalance < grandTotal) {
      throw new AppError(
        `Insufficient wallet balance. Available balance is ${formatInrAmount(walletBalance)}`,
        400
      );
    }
  }

  if (onlineAlreadyPaid) {
    const razorpayOrderId = readRazorpayOrderId(body);
    const razorpayPaymentId = readGatewayPaymentId(body);
    const razorpaySignature = readRazorpaySignature(body);
    if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
      await verifyRazorpayCheckoutPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });
    } else if (!razorpayPaymentId) {
      throw new AppError("Online payment confirmation requires razorpay_payment_id", 400);
    }
  }

  const decrementedLines = [];
  let order = null;
  let debitedAmount = 0;

  try {
    for (const line of checkoutLines) {
      await decrementProductStock(line);
      decrementedLines.push(line);
    }

    const paymentStatus = isWalletPayment || isOnlinePayment ? "paid" : "pending";

    order = await Order.create({
      orderNumber: generateEcomOrderNumber(),
      user: userId,
      items: orderItems,
      vendorFulfillments: await buildVendorFulfillmentsFromItems(orderItems),
      subTotal,
      discountTotal,
      taxTotal,
      shippingCharge,
      grandTotal,
      paymentMethod,
      paymentStatus,
      orderStatus: "pending",
      notes,
      addressSnapshot,
      placedAt: new Date(),
    });

    let walletBalance = null;
    let walletTransaction = null;
    let razorpayOrder = null;

    if (isWalletPayment) {
      walletBalance = await debitUserWallet(userId, grandTotal);
      debitedAmount = grandTotal;
      walletTransaction = await createWalletPaymentForOrder(userId, order, grandTotal);
    }

    if (isOnlinePayment && !onlineAlreadyPaid) {
      razorpayOrder = await createRazorpayOrder({
        amountRupees: grandTotal,
        receipt: `ecom_${String(order._id).slice(-10)}_${Date.now().toString().slice(-6)}`,
        notes: {
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          userId: String(userId),
        },
      });
    }

    await Cart.updateOne(
      { user: userId },
      {
        $set: {
          items: [],
          subTotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          shippingCharge: 0,
          grandTotal: 0,
        },
      }
    );

    const gateway =
      isOnlinePayment
        ? String(body.gateway || body.paymentGateway || "razorpay").trim() || "razorpay"
        : "";
    const gatewayOrderId = onlineAlreadyPaid
      ? readRazorpayOrderId(body)
      : razorpayOrder?.orderId || "";
    const gatewayPaymentId = onlineAlreadyPaid ? readGatewayPaymentId(body) : "";

    const transaction = await createEcomTransactionForOrder(order, {
      gateway,
      gatewayOrderId,
      gatewayPaymentId,
      providerResponse: body.providerResponse || {},
      remarks: isWalletPayment
        ? `Wallet payment for order ${order.orderNumber}`
        : isOnlinePayment
          ? onlineAlreadyPaid
            ? `Online payment for order ${order.orderNumber}`
            : `Online payment initiated for order ${order.orderNumber}`
          : `COD order ${order.orderNumber}`,
    });

    if (razorpayOrder?.orderId && transaction?._id) {
      await Transaction.updateOne(
        { _id: transaction._id },
        {
          $set: {
            gateway: "razorpay",
            gatewayOrderId: razorpayOrder.orderId,
            status: "initiated",
          },
        }
      );
      transaction.gateway = "razorpay";
      transaction.gatewayOrderId = razorpayOrder.orderId;
      transaction.status = "initiated";
    }

    const deliveryOtpRecord = await createDeliveryOtpForOrder(order._id, userId);
    const deliveryOtp = toUserDeliveryOtpPayload(deliveryOtpRecord, order.toObject());

    const baseUrl = options.baseUrl || "";
    let invoice = resolveInvoiceUrls(order.toObject(), baseUrl);

    try {
      const { ensureOrderInvoicePdf } = require("./ecomInvoice");
      const invoiceResult = await ensureOrderInvoicePdf(order._id, baseUrl);
      invoice = invoiceResult.invoice;
    } catch {
      // Checkout succeeds even if PDF generation fails; invoice can be generated on demand.
    }

    queueOrderPlacedNotification(order.toObject());

    const payload = toCheckoutOrderPayload(order.toObject(), addressSnapshot, transaction, customer, {
      walletBalance,
      walletTransaction,
      invoice,
      baseUrl,
      deliveryOtp,
    });

    return withOnlinePaymentFields(payload, razorpayOrder, {
      requiresPayment: isOnlinePayment && !onlineAlreadyPaid,
    });
  } catch (err) {
    if (debitedAmount > 0) {
      await creditUserWallet(userId, debitedAmount).catch(() => {});
    }
    if (order?._id) {
      await cancelDeliveryOtpForOrder(order._id).catch(() => {});
      await Order.deleteOne({ _id: order._id }).catch(() => {});
    }
    await restoreDecrementedStock(decrementedLines);
    throw err;
  }
}

async function confirmEcomOrderPayment(userId, orderId, body = {}, options = {}) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError("Order not found", 404);

  const method = String(order.paymentMethod || "").toLowerCase();
  if (method !== "online") {
    throw new AppError("Only online orders require payment confirmation", 400);
  }

  if (String(order.paymentStatus || "").toLowerCase() === "paid") {
    const transaction = await Transaction.findOne({ order: order._id, type: "payment" }).lean();
    const addressSnapshot = order.addressSnapshot || {};
    const customer = buildCustomerSnapshot(options.user, addressSnapshot);
    const payload = toCheckoutOrderPayload(order.toObject(), addressSnapshot, transaction, customer, {
      baseUrl: options.baseUrl || "",
      invoice: resolveInvoiceUrls(order.toObject(), options.baseUrl || ""),
    });
    return withOnlinePaymentFields(payload, null, { requiresPayment: false });
  }

  const razorpayOrderId = readRazorpayOrderId(body);
  const razorpayPaymentId = readGatewayPaymentId(body);
  const razorpaySignature = readRazorpaySignature(body);

  if (!razorpayPaymentId) {
    throw new AppError("razorpay_payment_id is required", 400);
  }

  if (razorpayOrderId && razorpaySignature) {
    await verifyRazorpayCheckoutPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
  }

  order.paymentStatus = "paid";
  await order.save();

  const gateway = String(body.gateway || body.paymentGateway || "razorpay").trim() || "razorpay";
  let transaction = await Transaction.findOne({ order: order._id, type: "payment" });
  if (transaction) {
    transaction.status = "success";
    transaction.gateway = gateway;
    if (razorpayOrderId) transaction.gatewayOrderId = razorpayOrderId;
    transaction.gatewayPaymentId = razorpayPaymentId;
    if (body.providerResponse) transaction.providerResponse = body.providerResponse;
    transaction.processedAt = new Date();
    transaction.remarks = `Online payment for order ${order.orderNumber}`;
    await transaction.save();
    transaction = transaction.toObject();
  } else {
    transaction = await createEcomTransactionForOrder(order, {
      gateway,
      gatewayOrderId: razorpayOrderId,
      gatewayPaymentId: razorpayPaymentId,
      providerResponse: body.providerResponse || {},
      remarks: `Online payment for order ${order.orderNumber}`,
    });
  }

  const addressSnapshot = order.addressSnapshot || {};
  const customer = buildCustomerSnapshot(options.user, addressSnapshot);
  const payload = toCheckoutOrderPayload(order.toObject(), addressSnapshot, transaction, customer, {
    baseUrl: options.baseUrl || "",
    invoice: resolveInvoiceUrls(order.toObject(), options.baseUrl || ""),
  });
  return withOnlinePaymentFields(payload, null, { requiresPayment: false });
}

module.exports = {
  placeCheckoutOrder,
  confirmEcomOrderPayment,
  generateEcomOrderNumber,
  PAYMENT_METHOD_LABELS,
  restoreProductStock,
};
