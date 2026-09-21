const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  listDriverOrders,
  getDriverOrderDetail,
  acceptDriverOrder,
  rejectDriverOrder,
  markDriverOrderDelivered,
} = require("../../utils/deliveryDriverOrder");

function resolveOrderId(req) {
  const orderId = req.params.orderId ?? req.body?.orderId ?? req.body?.order_id;
  if (!orderId) {
    throw new AppError("orderId is required", 400);
  }
  const normalized = String(orderId).trim();
  assertObjectId(normalized, "Invalid order id");
  return normalized;
}

/** GET /api/delivery/orders — tabs: new, processing, out_for_delivery, completed */
exports.listOrders = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const statusTab = req.query.status ?? req.query.tab ?? null;
  const baseUrl = getPublicBaseUrl(req);

  const result = await listDriverOrders(req.user._id, {
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

/** GET /api/delivery/orders/:orderId */
exports.getOrderDetail = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  const detail = await getDriverOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order detail fetched", detail);
});

/** POST /api/delivery/orders/:orderId/accept */
exports.acceptOrder = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const baseUrl = getPublicBaseUrl(req);
  await acceptDriverOrder(req.user._id, orderId);
  const detail = await getDriverOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Delivery accepted", detail);
});

/** POST /api/delivery/orders/:orderId/reject */
exports.rejectOrder = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const reason = String(req.body?.reason ?? req.body?.rejectionReason ?? "").trim();

  if (!reason) {
    throw new AppError("Rejection reason is required", 400);
  }

  const baseUrl = getPublicBaseUrl(req);
  await rejectDriverOrder(req.user._id, orderId, reason);
  const detail = await getDriverOrderDetail(req.user._id, orderId, baseUrl).catch(() => null);

  return sendSuccess(res, "Delivery rejected", detail || { orderId });
});

/** POST /api/delivery/orders/:orderId/delivered */
exports.markDelivered = asyncHandler(async (req, res) => {
  const orderId = resolveOrderId(req);
  const otp = req.body?.otp ?? req.body?.deliveryOtp ?? req.body?.delivery_otp;
  const baseUrl = getPublicBaseUrl(req);
  await markDriverOrderDelivered(req.user._id, orderId, { otp });
  const detail = await getDriverOrderDetail(req.user._id, orderId, baseUrl);

  return sendSuccess(res, "Order marked delivered", detail);
});
