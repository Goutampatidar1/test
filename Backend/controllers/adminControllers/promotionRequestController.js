const PromotionSubscription = require("../../models/other/promotionSubscription");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const {
  toPublicPromotionSubscription,
  approvePromotionRequest,
  rejectPromotionRequest,
  expireDueSubscriptions,
  buildPromotionDashboard,
} = require("../../utils/promotionEngine");

exports.listRequests = asyncHandler(async (req, res) => {
  await expireDueSubscriptions();
  const { page, limit, skip } = getPagination(req.query);
  const { status, approvalStatus, planType, search, ownerType, vendorType } = req.query;
  const filter = { status: { $ne: "pending_payment" } };

  if (status && String(status).trim()) filter.status = String(status).trim();
  if (approvalStatus && String(approvalStatus).trim()) {
    filter.approvalStatus = String(approvalStatus).trim();
  }
  if (planType && String(planType).trim()) filter.planType = String(planType).trim();
  const owner = String(ownerType || vendorType || "").trim().toLowerCase();
  if (owner === "venue") {
    filter.ownerType = "venue";
  } else if (owner === "ecom") {
    filter.$or = [{ ownerType: "ecom" }, { ownerType: { $exists: false } }, { ownerType: null }];
  }

  const searchOr = searchFilter(search, ["planName", "cityName", "subDistrictName"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [rows, total] = await Promise.all([
    PromotionSubscription.find(filter)
      .populate("vendor", "name businessName phone shopLogo")
      .populate("venueVendor", "name businessName phone profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PromotionSubscription.countDocuments(filter),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  res.json({
    requests: rows.map((row) => ({
      ...toPublicPromotionSubscription(row, baseUrl),
      ownerType: row.ownerType || "ecom",
      vendor: row.venueVendor
        ? {
            _id: row.venueVendor._id,
            name: row.venueVendor.businessName || row.venueVendor.name || "",
            phone: row.venueVendor.phone || "",
            shopLogo: row.venueVendor.profileImage || "",
            kind: "venue",
          }
        : row.vendor
          ? {
              _id: row.vendor._id,
              name: row.vendor.businessName || row.vendor.name || "",
              phone: row.vendor.phone || "",
              shopLogo: row.vendor.shopLogo || "",
              kind: "ecom",
            }
          : null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getRequestById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const row = await PromotionSubscription.findById(req.params.id)
    .populate("vendor", "name businessName phone shopLogo email")
    .populate("venueVendor", "name businessName phone profileImage email")
    .lean();
  if (!row) throw new AppError("Promotion request not found", 404);
  const baseUrl = getPublicBaseUrl(req);
  res.json({
    request: {
      ...toPublicPromotionSubscription(row, baseUrl),
      vendor: row.vendor || null,
    },
  });
});

exports.approveRequest = asyncHandler(async (req, res) => {
  const sub = await approvePromotionRequest(req.params.id, req.user?._id);
  const baseUrl = getPublicBaseUrl(req);
  res.json({
    message: "Promotion approved",
    request: toPublicPromotionSubscription(sub.toObject(), baseUrl),
  });
});

exports.rejectRequest = asyncHandler(async (req, res) => {
  const reason = req.body?.reason || req.body?.rejectionReason || "";
  const sub = await rejectPromotionRequest(req.params.id, req.user?._id, reason);
  const baseUrl = getPublicBaseUrl(req);
  res.json({
    message: "Promotion rejected",
    request: toPublicPromotionSubscription(sub.toObject(), baseUrl),
  });
});

exports.getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await buildPromotionDashboard();
  res.json({ dashboard });
});
