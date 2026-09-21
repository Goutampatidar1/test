const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { placeCheckoutOrder, confirmEcomOrderPayment } = require("../../utils/ecomCheckout");

function resolveAddressId(req) {
  const body = req.body ?? {};
  const addressId =
    body.addressId ?? body.shippingAddressId ?? body._id ?? req.query?.addressId;

  if (!addressId) {
    throw new AppError("addressId is required", 400);
  }

  const normalized = String(addressId).trim();
  assertObjectId(normalized, "Invalid address id");
  return normalized;
}

async function handleCheckout(req, res) {
  const baseUrl = getPublicBaseUrl(req);
  const payload = await placeCheckoutOrder(
    req.user._id,
    {
      ...(req.body ?? {}),
      addressId: resolveAddressId(req),
    },
    { user: req.user, baseUrl }
  );

  const requiresPayment = Boolean(payload?.requiresPayment);
  return res.status(requiresPayment ? 200 : 201).json({
    status: true,
    message: requiresPayment
      ? "Order created. Complete online payment to confirm."
      : "Order placed successfully",
    data: [payload],
  });
}

exports.checkout = asyncHandler(handleCheckout);
exports.payNow = asyncHandler(handleCheckout);

exports.confirmOrderPayment = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  assertObjectId(orderId, "Invalid order id");

  const baseUrl = getPublicBaseUrl(req);
  const payload = await confirmEcomOrderPayment(req.user._id, orderId, req.body ?? {}, {
    user: req.user,
    baseUrl,
  });

  return res.status(200).json({
    status: true,
    message: "Order payment confirmed",
    data: [payload],
  });
});
