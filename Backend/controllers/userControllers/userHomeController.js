const { User } = require("../../models");
const Product = require("../../models/other/product");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { sendSuccess } = require("../../utils/apiResponse");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { resolveSubDistrictFields } = require("../../utils/shippingAddress");
const { getFeatureSettings } = require("../../utils/appFeatureSettings");
const {
  recordRecentView,
  listRecentlyViewed,
  loadSuggestions,
  loadSuggestedVendors,
} = require("../../utils/homeFeed");

function toAreaPayload(user) {
  const subDistrict = user?.subDistrict || "";
  const city = user?.city || "";
  return {
    city,
    cityId: user?.cityId ?? null,
    subDistrict,
    subDistrictId: user?.subDistrictId ?? null,
    label: [subDistrict, city].filter(Boolean).join(", "),
    isSet: Boolean(subDistrict || city),
  };
}

/** GET /api/user/area — saved area shown in the app header */
exports.getArea = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("city cityId subDistrict subDistrictId").lean();
  sendSuccess(res, "Area fetched", toAreaPayload(user));
});

/** PUT /api/user/area — save the chosen area (subDistrictId, or city + subDistrict) */
exports.setArea = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("Account not found", 404);

  const fields = await resolveSubDistrictFields(
    { ...req.body, city: req.body.city ?? user.city },
    { city: req.body.city ?? user.city, requireSubDistrict: true, assertEcom: false }
  );
  user.city = fields.city;
  user.cityId = fields.cityId;
  user.subDistrict = fields.subDistrict;
  user.subDistrictId = fields.subDistrictId;
  await user.save();

  sendSuccess(res, "Area saved", toAreaPayload(user));
});

/** POST /api/user/recently-viewed { productId } */
exports.recordRecentlyViewed = asyncHandler(async (req, res) => {
  const productId = req.body?.productId ?? req.body?.product;
  assertObjectId(productId, "Invalid product id");
  const product = await Product.findById(productId).select("_id category").lean();
  if (!product) throw new AppError("Product not found", 404);
  await recordRecentView(req.user._id, product);
  sendSuccess(res, "Recorded", { productId });
});

/** GET /api/user/recently-viewed */
exports.listRecentlyViewed = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 30);
  const items = await listRecentlyViewed(req, { limit, baseUrl: getPublicBaseUrl(req) });
  return res.status(200).json({ status: items.length > 0, message: "Recently viewed fetched", data: items });
});

/** GET /api/user/suggestions — "Suggested for you" products (+ optional suggested vendors) */
exports.listSuggestions = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 30);
  const baseUrl = getPublicBaseUrl(req);
  const user = await User.findById(req.user._id).select("city subDistrict").lean();
  const [suggestions, vendors] = await Promise.all([
    loadSuggestions(req, { limit, baseUrl }),
    req.query.vendors === "0"
      ? []
      : loadSuggestedVendors(req, { limit: 6, baseUrl, city: user?.city, subDistrict: user?.subDistrict }),
  ]);
  const features = await getFeatureSettings();
  return res.status(200).json({
    status: suggestions.items.length > 0,
    message: "Suggestions fetched",
    data: suggestions.items,
    personalised: suggestions.personalised,
    vendors,
    enabled: (features.homeSections || []).find((s) => s.key === "suggestions")?.enabled !== false,
  });
});
