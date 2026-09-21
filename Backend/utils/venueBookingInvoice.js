const fs = require("fs");
const path = require("path");
const VenueOrder = require("../models/other/venueOrder");
const User = require("../models/entity/user");
const { AppConfig } = require("../models");
const AppError = require("./AppError");
const { toAbsoluteUploadUrl } = require("./mediaUrl");
const { formatDateOnly } = require("./dateOnly");
const { buildBookingPaymentSummary } = require("./venueBooking");
const {
  extractBookingDatesFromOrder,
  formatBookingRangeLabel,
  toAddressSnapshotFromOrder,
} = require("./venueBookingHistory");
const { generateInvoicePdfFile } = require("./ecomInvoicePdf");
const { resolveInvoicePdfAbsolutePath } = require("./ecomInvoice");

const PAYMENT_METHOD_LABELS = {
  cod: "Cash on delivery",
  online: "Online payment",
  wallet: "Wallet",
};

function formatInrAmount(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatOrderPlacedLabel(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatVenueLocation(venue) {
  if (!venue) return "";
  const cityState = [venue.city, venue.state].filter(Boolean).join(", ");
  if (cityState) return cityState;
  return venue.address || "";
}

function computeBookingAmounts(order) {
  const venueFee = (order.items ?? []).reduce(
    (sum, item) => sum + (Number(item.totalPrice) || 0),
    0
  );
  const discountTotal = Number(order.discountTotal) || 0;
  const taxTotal = Number(order.taxTotal) || 0;

  return {
    venueFee,
    discountTotal,
    taxTotal,
    tokenAmountPercentage: Number(order.tokenAmountPercentage) || 0,
    tokenAmount: Number(order.tokenAmount) || 0,
    amountPaid: Number(order.amountPaid) || 0,
    remainingAmount: Number(order.remainingAmount) || 0,
    subTotal: Number(order.subTotal) || 0,
    grandTotal: Number(order.grandTotal) || 0,
    venueFeeLabel: formatInrAmount(venueFee),
    tokenAmountLabel: formatInrAmount(order.tokenAmount),
    amountPaidLabel: formatInrAmount(order.amountPaid),
    remainingAmountLabel: formatInrAmount(order.remainingAmount),
    subTotalLabel: formatInrAmount(order.subTotal),
    grandTotalLabel: formatInrAmount(order.grandTotal),
  };
}

function resolveVenueInvoiceUrls(order, baseUrl) {
  const orderId = order?._id;
  const invoicePdf = order?.invoicePdf ? String(order.invoicePdf) : "";

  return {
    invoicePdf,
    invoicePdfUrl: invoicePdf ? toAbsoluteUploadUrl(invoicePdf, baseUrl) : "",
    invoiceUrl: orderId && baseUrl ? `${baseUrl}/api/user/booking-invoice/${orderId}` : "",
    invoiceHtmlUrl:
      orderId && baseUrl ? `${baseUrl}/api/user/booking-invoice/${orderId}?format=html` : "",
  };
}

function buildVenueInvoiceItems(order) {
  const amounts = computeBookingAmounts(order);
  const lineItems = (order.items ?? []).map((item) => {
    const bookingDate = formatDateOnly(item.bookingDate);
    const datePart = bookingDate ? ` · ${bookingDate}` : "";
    const slot = item.bookingSlot ? ` (${item.bookingSlot})` : "";

    return {
      productName: `${item.name || "Venue"}${datePart}${slot}`,
      sku: item.bookingType || "venue",
      quantity: item.quantity ?? 1,
      unitPrice: item.unitPrice ?? 0,
      unitPriceLabel: formatInrAmount(item.unitPrice),
      totalPrice: item.totalPrice ?? 0,
      totalPriceLabel: formatInrAmount(item.totalPrice),
    };
  });

  return lineItems;
}

function buildVenueInvoicePayload(order, user, venue, baseUrl) {
  const address = toAddressSnapshotFromOrder(order);
  const bookingDates = extractBookingDatesFromOrder(order);
  const dateLabel = formatBookingRangeLabel(bookingDates);
  const amounts = computeBookingAmounts(order);
  const items = buildVenueInvoiceItems(order);
  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod ?? "—";

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
  <h1>Booking Invoice</h1>
  <p class="tag">Venue booking · ${escapeHtml(order.orderNumber)}</p>
  <div class="meta">
    <div><strong>Bill to</strong><br/>${escapeHtml(user?.name || address.name || "—")}</div>
    <div><strong>Contact</strong><br/>${escapeHtml(user?.phone || address.phone || "—")}</div>
    <div><strong>Venue</strong><br/>${escapeHtml(venue?.name || items[0]?.productName || "—")}</div>
    <div><strong>Location</strong><br/>${escapeHtml(formatVenueLocation(venue) || "—")}</div>
    <div><strong>Booking dates</strong><br/>${escapeHtml(dateLabel || "—")}</div>
    <div><strong>Payment</strong><br/>${escapeHtml(order.paymentStatus)} · ${escapeHtml(paymentMethodLabel)}</div>
    <div><strong>Booking status</strong><br/>${escapeHtml(order.orderStatus)}</div>
    <div><strong>Date</strong><br/>${escapeHtml(formatOrderPlacedLabel(order.placedAt ?? order.createdAt))}</div>
  </div>
  <table>
    <thead>
      <tr><th>Item</th><th>Type</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div>Venue fee: <strong>${escapeHtml(amounts.venueFeeLabel)}</strong></div>
    ${amounts.tokenAmount > 0 ? `<div>Token paid (${escapeHtml(amounts.tokenAmountPercentage)}%): <strong>${escapeHtml(amounts.tokenAmountLabel)}</strong></div>` : ""}
    ${amounts.amountPaid > 0 ? `<div>Amount paid: <strong>${escapeHtml(amounts.amountPaidLabel)}</strong></div>` : ""}
    ${amounts.remainingAmount > 0 ? `<div>Remaining: <strong>${escapeHtml(amounts.remainingAmountLabel)}</strong></div>` : ""}
    <div class="grand">Total: ${escapeHtml(amounts.grandTotalLabel)}</div>
  </div>
</body>
</html>`;

  const invoiceUrls = resolveVenueInvoiceUrls(order, baseUrl);

  return {
    invoiceNumber: order.orderNumber,
    bookingId: order._id,
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    bookingStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt ?? order.createdAt,
    placedAtLabel: formatOrderPlacedLabel(order.placedAt ?? order.createdAt),
    venue: venue
      ? {
          _id: venue._id,
          name: venue.name,
          location: formatVenueLocation(venue),
          thumbnail: venue.thumbnail ? toAbsoluteUploadUrl(venue.thumbnail, baseUrl) : "",
        }
      : null,
    bookingSummary: {
      dateLabel,
      bookingDates,
      ...amounts,
      currency: "INR",
      symbol: "₹",
    },
    billTo: {
      name: user?.name || address.name || "",
      phone: user?.phone || address.phone || "",
      email: user?.email || address.email || "",
      address: address.address || "",
    },
    items,
    paymentDetail: {
      paymentMethod: order.paymentMethod,
      paymentMethodLabel,
      paymentStatus: order.paymentStatus,
      subTotal: amounts.subTotal,
      subTotalLabel: amounts.subTotalLabel,
      venueFee: amounts.venueFee,
      venueFeeLabel: amounts.venueFeeLabel,
      tokenAmount: amounts.tokenAmount,
      tokenAmountLabel: amounts.tokenAmountLabel,
      amountPaid: amounts.amountPaid,
      amountPaidLabel: amounts.amountPaidLabel,
      remainingAmount: amounts.remainingAmount,
      remainingAmountLabel: amounts.remainingAmountLabel,
      total: amounts.grandTotal,
      totalLabel: amounts.grandTotalLabel,
    },
    summary: {
      subTotal: amounts.subTotal,
      subTotalLabel: amounts.subTotalLabel,
      shippingCost: 0,
      shippingCostLabel: formatInrAmount(0),
      totalAmount: amounts.grandTotal,
      totalAmountLabel: amounts.grandTotalLabel,
    },
    invoiceHtml,
    ...invoiceUrls,
  };
}

async function loadVenueOrderForInvoice(orderId) {
  const order = await VenueOrder.findById(orderId)
    .populate("items.venue", "name thumbnail address city state")
    .lean();
  if (!order) {
    throw new AppError("Booking not found", 404);
  }
  return order;
}

function getPrimaryVenueFromOrder(order) {
  const item = (order.items ?? []).find((row) => row.venue && typeof row.venue === "object");
  return item?.venue ?? null;
}

async function buildVenueInvoiceDataForOrder(order, baseUrl) {
  const user = await User.findById(order.user).select("name phone email").lean();
  const config = await AppConfig.findOne().select("app_name").lean();
  const venue = getPrimaryVenueFromOrder(order);
  const payload = buildVenueInvoicePayload(order, user, venue, baseUrl);
  payload.appName = config?.app_name || "OHO E-Bazar";
  return payload;
}

async function ensureVenueBookingInvoicePdf(orderId, baseUrl) {
  const order = await loadVenueOrderForInvoice(orderId);
  const invoiceData = await buildVenueInvoiceDataForOrder(order, baseUrl);
  const savedPath = await generateInvoicePdfFile(invoiceData, `venue-${order.orderNumber}`);

  await VenueOrder.updateOne({ _id: order._id }, { $set: { invoicePdf: savedPath } });

  const freshOrder = { ...order, invoicePdf: savedPath };
  return {
    order: freshOrder,
    invoice: resolveVenueInvoiceUrls(freshOrder, baseUrl),
    invoiceData,
  };
}

async function getUserVenueBookingInvoice(userId, bookingId, baseUrl) {
  const order = await VenueOrder.findOne({ _id: bookingId, user: userId })
    .populate("items.venue", "name thumbnail address city state")
    .lean();

  if (!order) {
    throw new AppError("Booking not found", 404);
  }

  const result = await ensureVenueBookingInvoicePdf(bookingId, baseUrl);
  const invoiceData =
    result.invoiceData || (await buildVenueInvoiceDataForOrder(result.order, baseUrl));

  return {
    ...invoiceData,
    ...result.invoice,
  };
}

function attachVenueBookingInvoice(order, baseUrl) {
  const amounts = computeBookingAmounts(order);
  const payment = buildBookingPaymentSummary(order);
  const bookingDates = extractBookingDatesFromOrder(order);
  const venue =
    (order.items ?? []).find((item) => item.venue && typeof item.venue === "object")?.venue ?? null;

  return {
    bookingSummary: {
      dateLabel: formatBookingRangeLabel(bookingDates),
      bookingDates,
      venueFee: amounts.venueFee,
      venueFeeLabel: amounts.venueFeeLabel,
      ...amounts,
      ...payment,
      currency: "INR",
      symbol: "₹",
    },
    payment,
    paymentSummary: payment,
    invoice: resolveVenueInvoiceUrls(order, baseUrl),
    venueLocation: formatVenueLocation(venue),
  };
}

module.exports = {
  buildVenueInvoicePayload,
  getUserVenueBookingInvoice,
  ensureVenueBookingInvoicePdf,
  resolveVenueInvoiceUrls,
  attachVenueBookingInvoice,
  computeBookingAmounts,
  resolveInvoicePdfAbsolutePath,
};
