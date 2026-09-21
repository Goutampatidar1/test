const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const { parseDateRangeFromQuery } = require("../../utils/dateOnly");
const {
  getOrderDetail,
  cancelUserOrder,
} = require("../../utils/ecomOrder");
const { sendInvoiceResponse, getUserOrderInvoice } = require("../../utils/ecomInvoiceResponse");
const { listUserOrderHistory } = require("../../utils/ecomOrderHistory");

function resolveOrderId(req) {
  const orderId =
    req.params.orderId ?? req.body?.orderId ?? req.query?.orderId;

  if (!orderId) {
    throw new AppError("orderId is required", 400);
  }

  const normalized = String(orderId).trim();
  assertObjectId(normalized, "Invalid order id");
  return normalized;
}

exports.getOrderDetail = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  const detail = await getOrderDetail(req.user._id, orderId, baseUrl);

  return res.status(200).json({
    status: true,
    message: "Order detail fetched",
    data: [detail],
  });
});

exports.trackOrder = exports.getOrderDetail;

exports.cancelOrder = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const reason = String(req.body?.reason ?? req.body?.cancellationReason ?? "").trim();

  if (!reason) {
    throw new AppError("Cancellation reason is required", 400);
  }

  const { refund } = await cancelUserOrder(req.user._id, orderId, reason);

  const baseUrl = getPublicBaseUrl(req);
  const detail = await getOrderDetail(req.user._id, orderId, baseUrl);
  if (detail?.refund && refund) {
    detail.refund = {
      ...detail.refund,
      refundedToWallet: Boolean(refund.refunded),
      alreadyRefunded: Boolean(refund.alreadyRefunded),
      refundAmount: Number(refund.refundAmount) || 0,
      refundAmountLabel: detail.refund.refundAmountLabel,
    };
    if (!refund.refunded) {
      detail.refund.refundAmount = 0;
      detail.refund.refundAmountLabel = "₹0";
      detail.refund.refundedToWallet = false;
    }
  }

  const message = refund?.refunded
    ? "Order cancelled and refund credited to wallet"
    : refund?.alreadyRefunded
      ? "Order cancelled (refund was already processed)"
      : "Order cancelled successfully";

  return res.status(200).json({
    status: true,
    message,
    data: [detail],
  });
});

exports.getOrderInvoice = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  const invoice = await getUserOrderInvoice(req.user._id, orderId, baseUrl);
  return sendInvoiceResponse(req, res, invoice);
});

/** Order history list — grouped by date on mobile */
exports.listOrderHistory = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const statusFilter = req.query.status
    ? String(req.query.status).trim().toLowerCase()
    : null;
  const dateRange = parseDateRangeFromQuery(req.query);
  const baseUrl = getPublicBaseUrl(req);

  const result = await listUserOrderHistory(req.user._id, {
    status: statusFilter,
    dateRange,
    page,
    limit,
    baseUrl,
  });

  return res.status(200).json({
    status: result.orders.length > 0,
    message: "Order history fetched",
    data: result.orders,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
    filters: {
      status: statusFilter,
      startDate: dateRange?.startDate ?? null,
      endDate: dateRange?.endDate ?? null,
      filterBy: dateRange ? "placedAt" : null,
    },
  });
});
