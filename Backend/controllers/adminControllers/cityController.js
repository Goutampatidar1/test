const State = require("../../models/other/state");
const City = require("../../models/other/city");
const SubDistrict = require("../../models/other/subDistrict");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");

const ALLOWED_STATUS = new Set(["active", "inactive"]);

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertCityNameUnique(stateId, name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = { state: stateId, name: exactNameRx };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await City.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("City name already exists in this state", 409);
}

exports.listCities = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, state: stateId, all } = req.query;

  const filter = {};
  if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (stateId) {
    assertObjectId(stateId, "Invalid state id");
    filter.state = stateId;
  }
  const searchOr = searchFilter(search, ["name", "pincode"]);
  if (searchOr) Object.assign(filter, searchOr);

  const query = City.find(filter)
    .populate("state", "name code status")
    .sort({ name: 1 });
  if (all !== "true" && all !== "1") {
    query.skip(skip).limit(limit);
  }

  const [cities, total] = await Promise.all([query.lean(), City.countDocuments(filter)]);

  res.json({
    cities,
    pagination: {
      page: all === "true" || all === "1" ? 1 : page,
      limit: all === "true" || all === "1" ? total : limit,
      total,
      pages: all === "true" || all === "1" ? 1 : Math.ceil(total / limit) || 1,
    },
  });
});

exports.getCityById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const city = await City.findById(req.params.id).populate("state", "name code status").lean();
  if (!city) throw new AppError("City not found", 404);
  res.json({ city });
});

exports.createCity = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const stateId = normalizeRequired(req.body.state);
  const pincode = normalizeOptional(req.body.pincode);
  const status = normalizeRequired(req.body.status || "active");

  if (!name) throw new AppError("City name is required", 400);
  if (!stateId) throw new AppError("State is required", 400);
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);

  assertObjectId(stateId, "Invalid state id");
  const parent = await State.findById(stateId).select("_id").lean();
  if (!parent) throw new AppError("State not found", 404);

  await assertCityNameUnique(stateId, name);

  const city = await City.create({
    name,
    state: stateId,
    pincode,
    status,
  });

  const populated = await City.findById(city._id).populate("state", "name code status").lean();
  res.status(201).json({ message: "City created", city: populated });
});

exports.updateCity = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const city = await City.findById(req.params.id);
  if (!city) throw new AppError("City not found", 404);

  let nextStateId = String(city.state);

  if (Object.prototype.hasOwnProperty.call(req.body, "state")) {
    const stateId = normalizeRequired(req.body.state);
    assertObjectId(stateId, "Invalid state id");
    const parent = await State.findById(stateId).select("_id").lean();
    if (!parent) throw new AppError("State not found", 404);
    nextStateId = stateId;
    city.state = stateId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("City name cannot be empty", 400);
    await assertCityNameUnique(nextStateId, name, city._id);
    city.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "pincode")) {
    city.pincode = normalizeOptional(req.body.pincode);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    city.status = status;
  }

  await city.save();
  const populated = await City.findById(city._id).populate("state", "name code status").lean();
  res.json({ message: "City updated", city: populated });
});

exports.deleteCity = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const city = await City.findById(req.params.id);
  if (!city) throw new AppError("City not found", 404);

  const subDistrictCount = await SubDistrict.countDocuments({ city: city._id });
  if (subDistrictCount > 0) {
    throw new AppError("Remove sub-districts under this city before deleting it", 400);
  }

  await City.findByIdAndDelete(city._id);
  res.json({ message: "City deleted" });
});
