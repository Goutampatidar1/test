const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const AppError = require("../../utils/AppError");
const {
  createShippingAddress,
  getUserShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  listShippingAddresses,
  toShippingAddressItem,
} = require("../../utils/shippingAddress");

function resolveAddressId(req) {
  const addressId =
    req.params.addressId ??
    req.body?.addressId ??
    req.body?._id ??
    req.query?.addressId;

  if (!addressId) {
    throw new AppError("addressId is required", 400);
  }

  const normalized = String(addressId).trim();
  assertObjectId(normalized, "Invalid address id");
  return normalized;
}

exports.listShippingAddresses = asyncHandler(async (req, res) => {
  const rows = await listShippingAddresses(req.user._id);
  const items = (
    await Promise.all(rows.map((row) => toShippingAddressItem(row)))
  ).filter(Boolean);

  return res.status(200).json({
    status: items.length > 0,
    message: "Shipping addresses fetched",
    data: items,
  });
});

exports.getShippingAddress = asyncHandler(async (req, res) => {
  const addressId = resolveAddressId(req);
  const row = await getUserShippingAddress(req.user._id, addressId);

  return res.status(200).json({
    status: true,
    message: "Shipping address fetched",
    data: [await toShippingAddressItem(row)],
  });
});

exports.addShippingAddress = asyncHandler(async (req, res) => {
  const saved = await createShippingAddress(req.user._id, req.body ?? {});

  return res.status(201).json({
    status: true,
    message: "Shipping address added",
    data: [await toShippingAddressItem(saved)],
  });
});

exports.updateShippingAddress = asyncHandler(async (req, res) => {
  const addressId = resolveAddressId(req);

  const saved = await updateShippingAddress(
    req.user._id,
    addressId,
    req.body ?? {}
  );

  return res.status(200).json({
    status: true,
    message: "Shipping address updated",
    data: [await toShippingAddressItem(saved)],
  });
});

exports.deleteShippingAddress = asyncHandler(async (req, res) => {
  const addressId = resolveAddressId(req);
  const result = await deleteShippingAddress(req.user._id, addressId);

  return res.status(200).json({
    status: true,
    message: "Shipping address deleted",
    data: [result],
  });
});
