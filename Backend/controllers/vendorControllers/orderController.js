const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const { sendSuccess } = require("../../utils/apiResponse");
const {
  listVendorOrders,
  getVendorHomeDashboard,
  getVendorOrderDetail,
  acceptVendorOrder,
  rejectVendorOrder,
  updateVendorOrderStatus,
  markVendorOrderOutForDelivery,
} = require("../../utils/ecomVendorOrder");
const { sendInvoiceResponse, getVendorOrderInvoice } = require("../../utils/ecomInvoiceResponse");
const { listActiveBanners, resolveRequestCity } = require("../../utils/bannerQuery");
const { listActiveVendorAnnouncements } = require("../../utils/vendorAnnouncement");

function resolveOrderId(req) {
  const orderId = req.params.orderId ?? req.body?.orderId;
  if (!orderId) {
    throw new AppError("orderId is required", 400);
  }
  const normalized = String(orderId).trim();
  assertObjectId(normalized, "Invalid order id");
  return normalized;
}

/** Vendor home / dashboard — earnings, rating, stats, new orders preview, ecom banners (with related) */
exports.getHome = asyncHandler(async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const previewLimit = Math.min(
    20,
    Math.max(1, parseInt(String(req.query.newOrdersLimit || "5"), 10) || 5)
  );
  const city = resolveRequestCity(req) || String(req.user?.city ?? "").trim();

  const [dashboard, banners, announcements] = await Promise.all([
    getVendorHomeDashboard(req.user._id, {
      baseUrl,
      newOrdersLimit: previewLimit,
    }),
    listActiveBanners({ city, targetType: "ecom", baseUrl }),
    listActiveVendorAnnouncements({ vendorKind: "ecom" }),
  ]);

  return sendSuccess(res, "Vendor home fetched", {
    ...dashboard,
    banners,
    announcements,
  });
});

/** Vendor order list — status tabs: new, accepted, out_for_delivery, completed, cancelled */
exports.listOrders = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const statusTab = req.query.status ?? req.query.tab ?? null;
  const baseUrl = getPublicBaseUrl(req);

  const result = await listVendorOrders(req.user._id, {
    statusTab,
    page,
    limit,
    baseUrl,
  });

  return res.status(200).json({
    status: result.orders.length > 0,
    message: "Orders fetched",
    data: result.orders,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
    filters: {
      status: statusTab,
    },
  });
});

/** Vendor order detail */
exports.getOrderDetail = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  const detail = await getVendorOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order detail fetched", detail);
});

/** Download / view order invoice PDF */
exports.getOrderInvoice = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  const invoice = await getVendorOrderInvoice(req.user._id, orderId, baseUrl);
  return sendInvoiceResponse(req, res, invoice);
});

/** Accept a new order */
exports.acceptOrder = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  await acceptVendorOrder(req.user._id, orderId);
  const detail = await getVendorOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order accepted", detail);
});

/** Reject a new order — reason required */
exports.rejectOrder = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const reason = String(req.body?.reason ?? req.body?.rejectionReason ?? "").trim();

  if (!reason) {
    throw new AppError("Rejection reason is required", 400);
  }

  const baseUrl = getPublicBaseUrl(req);
  await rejectVendorOrder(req.user._id, orderId, reason);
  const detail = await getVendorOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order rejected", detail);
});

/** Update fulfillment status — shipped | delivered (out_for_delivery alias) */
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const nextStatus = req.body?.status ?? req.body?.orderStatus;

  if (!nextStatus) {
    throw new AppError("status is required", 400);
  }

  const baseUrl = getPublicBaseUrl(req);
  await updateVendorOrderStatus(req.user._id, orderId, nextStatus);
  const detail = await getVendorOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order status updated", detail);
});

/** @deprecated Processing step removed — accept order instead. Kept for older apps (no-op when already accepted). */
exports.markProcessing = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  await updateVendorOrderStatus(req.user._id, orderId, "processing");
  const detail = await getVendorOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order is already accepted", detail);
});

/** Mark accepted order as out for delivery (shipped) */
exports.markOutForDelivery = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  await markVendorOrderOutForDelivery(req.user._id, orderId);
  const detail = await getVendorOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order marked out for delivery", detail);
});
