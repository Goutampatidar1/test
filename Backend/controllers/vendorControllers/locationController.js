const State = require("../../models/other/state");
const City = require("../../models/other/city");
const SubDistrict = require("../../models/other/subDistrict");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { sendSuccess } = require("../../utils/apiResponse");
const { toVendorState, toVendorCity, toVendorSubDistrict } = require("../../utils/mobilePresenters");

async function getActiveCityIdsWithSubDistricts(stateId) {
  const cityIds = await SubDistrict.distinct("city", { status: "active" });
  if (!cityIds.length) return [];

  if (!stateId) return cityIds;

  return City.find({
    _id: { $in: cityIds },
    state: stateId,
    status: "active",
  }).distinct("_id");
}

async function listCitiesHandler(req, res, { onlyWithSubDistricts = false } = {}) {
  const stateId = req.params.stateId || req.query.state || req.query.stateId;

  const filter = { status: "active" };

  if (stateId) {
    assertObjectId(stateId, "Invalid state id");
    const state = await State.findOne({ _id: stateId, status: "active" })
      .select("_id name code status")
      .lean();
    if (!state) {
      throw new AppError("State not found", 404);
    }
    filter.state = stateId;
  }

  if (onlyWithSubDistricts) {
    const cityIds = await getActiveCityIdsWithSubDistricts(stateId);
    if (!cityIds.length) {
      return sendSuccess(res, "Cities fetched", []);
    }
    filter._id = { $in: cityIds };
  }

  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "200",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search } = req.query;

  const searchOr = searchFilter(search, ["name", "pincode"]);
  if (searchOr) Object.assign(filter, searchOr);

  const cities = await City.find(filter)
    .populate("state", "name code status")
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const items = cities.map((doc) => toVendorCity(doc)).filter(Boolean);
  sendSuccess(res, "Cities fetched", items);
}

/** Active states for vendor register / address forms (no auth) */
exports.listStates = asyncHandler(async (req, res) => {
  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "100",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search } = req.query;

  const filter = { status: "active" };
  const searchOr = searchFilter(search, ["name", "code"]);
  if (searchOr) Object.assign(filter, searchOr);

  const states = await State.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean();

  const items = states.map((doc) => toVendorState(doc)).filter(Boolean);
  sendSuccess(res, "States fetched", items);
});

/** Active cities (no auth). Optional state filter. */
exports.listCities = asyncHandler(async (req, res) => listCitiesHandler(req, res));

/** User app — cities that have at least one active sub-district */
exports.listUserCities = asyncHandler(async (req, res) =>
  listCitiesHandler(req, res, { onlyWithSubDistricts: true })
);

/** Active sub-districts. Optional city filter via query or path param. */
exports.listSubDistricts = asyncHandler(async (req, res) => {
  const cityId =
    req.params.cityId ??
    req.query.city ??
    req.query.cityId ??
    req.query.cities ??
    req.query["city-id"] ??
    null;

  const filter = { status: "active" };

  if (cityId) {
    const normalizedCityId = String(cityId).trim();
    assertObjectId(normalizedCityId, "Invalid city id");
    const city = await City.findOne({ _id: normalizedCityId, status: "active" })
      .select("_id name pincode status")
      .populate("state", "name code status")
      .lean();
    if (!city) {
      throw new AppError("City not found", 404);
    }
    filter.city = normalizedCityId;
  }

  const paginationQuery = {
    ...req.query,
    limit: req.query.limit ?? "200",
  };
  const { limit, skip } = getPagination(paginationQuery);
  const { search } = req.query;

  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const subDistricts = await SubDistrict.find(filter)
    .populate("city", "name pincode status")
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const items = subDistricts.map((doc) => toVendorSubDistrict(doc)).filter(Boolean);
  sendSuccess(res, "Sub-districts fetched", items);
});
