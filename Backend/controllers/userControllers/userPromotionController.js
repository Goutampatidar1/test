const { asyncHandler } = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  listPromotionalBanners,
  listVerifiedVendors,
  listPromotedProducts,
} = require("../../utils/promotionEngine");

const { resolveShoppingArea } = require("../../utils/catalogLocation");

/** GET /api/user/promotional-banners */
exports.listPromotionalBanners = asyncHandler(async (req, res) => {
  const area = await resolveShoppingArea(req);
  const cityId = area.cityId;
  const subDistrictId = area.scope === "city" ? null : area.subDistrictId;
  if (!cityId && !subDistrictId) {
    return sendSuccess(res, "cityId or subDistrictId is required", []);
  }
  const items = await listPromotionalBanners({
    cityId,
    subDistrictId,
    ownerType: req.query.ownerType || req.query.type || "",
    baseUrl: getPublicBaseUrl(req),
  });
  sendSuccess(res, "Promotional banners fetched", items);
});

/** GET /api/user/verified-vendors */
exports.listVerifiedVendors = asyncHandler(async (req, res) => {
  const area = await resolveShoppingArea(req);
  const cityId = area.cityId;
  const subDistrictId = area.scope === "city" ? null : area.subDistrictId;
  if (!cityId && !subDistrictId) {
    return sendSuccess(res, "cityId or subDistrictId is required", []);
  }
  const items = await listVerifiedVendors({
    cityId,
    subDistrictId,
    baseUrl: getPublicBaseUrl(req),
  });
  sendSuccess(res, "Verified vendors fetched", items);
});

/** GET /api/user/promoted-products */
exports.listPromotedProducts = asyncHandler(async (req, res) => {
  const area = await resolveShoppingArea(req);
  const cityId = area.cityId;
  const subDistrictId = area.scope === "city" ? null : area.subDistrictId;
  if (!cityId && !subDistrictId) {
    return sendSuccess(res, "cityId or subDistrictId is required", []);
  }
  const search = req.query.search || req.query.q || "";
  const items = await listPromotedProducts({
    cityId,
    subDistrictId,
    search,
    baseUrl: getPublicBaseUrl(req),
  });
  sendSuccess(res, "Promoted products fetched", items);
});
