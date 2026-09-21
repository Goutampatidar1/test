const { asyncHandler } = require("../../utils/asyncHandler");
const { getPublicBaseUrl } = require("../../utils/mediaUrl");
const { getPagination } = require("../../utils/listQuery");
const { listNearbyVendors } = require("../../utils/nearbyVendors");

function readVendorListQuery(query = {}) {
  return {
    city: normalizeOptionalQuery(query.city ?? query.cityName),
    state: normalizeOptionalQuery(query.state),
    subDistrict: normalizeOptionalQuery(
      query.subDistrict ??
        query.subDistrictName ??
        query.sub_district ??
        query.sub_district_name
    ),
    subDistrictId: normalizeOptionalQuery(query.subDistrictId ?? query.sub_district_id),
    search: normalizeOptionalQuery(query.search ?? query.q),
  };
}

function normalizeOptionalQuery(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function hasEmptyLocationParam(query = {}) {
  const keys = [
    "subDistrictId",
    "sub_district_id",
    "subDistrict",
    "sub_district",
    "city",
    "cityName",
  ];

  return keys.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(query, key)) return false;
    return !String(query[key] ?? "").trim();
  });
}

async function handleVendorList(req, res, options = {}) {
  const { page, limit } = getPagination({
    ...req.query,
    limit: req.query.limit ?? options.defaultLimit ?? "20",
  });
  const baseUrl = getPublicBaseUrl(req);
  const userId = req.user?._id ?? null;

  const result = await listNearbyVendors({
    userId,
    ...readVendorListQuery(req.query),
    hadEmptyLocationParam: hasEmptyLocationParam(req.query),
    locationOptional: options.locationOptional ?? false,
    page,
    limit,
    baseUrl,
    sortBy: options.sortBy ?? "recent",
  });

  let title = "All vendors";
  if (result.city) {
    title = `Vendors in ${result.city}`;
    if (result.subDistrict) {
      title = `Vendors in ${result.subDistrict}, ${result.city}`;
    }
    if (result.state) {
      title = `${title}, ${result.state}`;
    }
  }

  return res.status(200).json({
    status: result.vendors.length > 0,
    message: options.message ?? "Vendors fetched",
    title,
    screen: options.screen ?? "vendors",
    data: result.vendors,
    location: {
      city: result.city,
      state: result.state,
      subDistrict: result.subDistrict,
      subDistrictId: result.subDistrictId,
    },
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
}

/** Home — nearby vendors preview (default limit 4) */
exports.listNearbyVendors = asyncHandler(async (req, res) => {
  return handleVendorList(req, res, {
    defaultLimit: "4",
    message: "Nearby vendors fetched",
    screen: "home_nearby",
    sortBy: "recent",
  });
});

/** View All — full vendor list (location filter optional) */
exports.listAllVendors = asyncHandler(async (req, res) => {
  return handleVendorList(req, res, {
    defaultLimit: "20",
    message: "All vendors fetched",
    screen: "view_all",
    sortBy: "name",
    locationOptional: true,
  });
});
