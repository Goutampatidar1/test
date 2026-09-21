const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { buildPublicVendorProfile, listVendorProducts } = require("../../utils/publicVendorProfile");

exports.getVendorProfile = asyncHandler(async (req, res) => {
  assertObjectId(req.params.vendorId, "Invalid vendor id");
  const baseUrl = getPublicBaseUrl(req);

  const profile = await buildPublicVendorProfile(req.params.vendorId, baseUrl);

  return res.status(200).json({
    status: true,
    message: "Vendor profile fetched",
    data: [profile],
  });
});

exports.listVendorProducts = asyncHandler(async (req, res) => {
  assertObjectId(req.params.vendorId, "Invalid vendor id");
  const { page, limit, skip } = getPagination(req.query);
  const baseUrl = getPublicBaseUrl(req);

  const { items, total } = await listVendorProducts(req.params.vendorId, baseUrl, {
    page,
    limit,
    skip,
  });

  return res.status(200).json({
    status: items.length > 0,
    message: "Vendor products fetched",
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});
