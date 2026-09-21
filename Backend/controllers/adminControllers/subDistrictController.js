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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertSubDistrictNameUnique(cityId, name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = { city: cityId, name: exactNameRx };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await SubDistrict.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("Sub-district name already exists in this city", 409);
}

exports.listSubDistricts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, city: cityId, all } = req.query;

  const filter = {};
  if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  if (cityId) {
    assertObjectId(cityId, "Invalid city id");
    filter.city = cityId;
  }
  const searchOr = searchFilter(search, ["name"]);
  if (searchOr) Object.assign(filter, searchOr);

  const query = SubDistrict.find(filter)
    .populate({
      path: "city",
      select: "name pincode status",
      populate: { path: "state", select: "name code status" },
    })
    .sort({ name: 1 });
  if (all !== "true" && all !== "1") {
    query.skip(skip).limit(limit);
  }

  const [subDistricts, total] = await Promise.all([query.lean(), SubDistrict.countDocuments(filter)]);

  res.json({
    subDistricts,
    pagination: {
      page: all === "true" || all === "1" ? 1 : page,
      limit: all === "true" || all === "1" ? total : limit,
      total,
      pages: all === "true" || all === "1" ? 1 : Math.ceil(total / limit) || 1,
    },
  });
});

exports.getSubDistrictById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subDistrict = await SubDistrict.findById(req.params.id)
    .populate({
      path: "city",
      select: "name pincode status",
      populate: { path: "state", select: "name code status" },
    })
    .lean();
  if (!subDistrict) throw new AppError("Sub-district not found", 404);
  res.json({ subDistrict });
});

exports.createSubDistrict = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const cityId = normalizeRequired(req.body.city);
  const status = normalizeRequired(req.body.status || "active");

  if (!name) throw new AppError("Sub-district name is required", 400);
  if (!cityId) throw new AppError("City is required", 400);
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);

  assertObjectId(cityId, "Invalid city id");
  const parent = await City.findById(cityId).select("_id").lean();
  if (!parent) throw new AppError("City not found", 404);

  await assertSubDistrictNameUnique(cityId, name);

  const subDistrict = await SubDistrict.create({
    name,
    city: cityId,
    status,
  });

  const populated = await SubDistrict.findById(subDistrict._id)
    .populate({
      path: "city",
      select: "name pincode status",
      populate: { path: "state", select: "name code status" },
    })
    .lean();
  res.status(201).json({ message: "Sub-district created", subDistrict: populated });
});

exports.updateSubDistrict = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subDistrict = await SubDistrict.findById(req.params.id);
  if (!subDistrict) throw new AppError("Sub-district not found", 404);

  let nextCityId = String(subDistrict.city);

  if (Object.prototype.hasOwnProperty.call(req.body, "city")) {
    const cityId = normalizeRequired(req.body.city);
    assertObjectId(cityId, "Invalid city id");
    const parent = await City.findById(cityId).select("_id").lean();
    if (!parent) throw new AppError("City not found", 404);
    nextCityId = cityId;
    subDistrict.city = cityId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("Sub-district name cannot be empty", 400);
    await assertSubDistrictNameUnique(nextCityId, name, subDistrict._id);
    subDistrict.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    subDistrict.status = status;
  }

  await subDistrict.save();
  const populated = await SubDistrict.findById(subDistrict._id)
    .populate({
      path: "city",
      select: "name pincode status",
      populate: { path: "state", select: "name code status" },
    })
    .lean();
  res.json({ message: "Sub-district updated", subDistrict: populated });
});

exports.deleteSubDistrict = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const subDistrict = await SubDistrict.findById(req.params.id);
  if (!subDistrict) throw new AppError("Sub-district not found", 404);
  await SubDistrict.findByIdAndDelete(subDistrict._id);
  res.json({ message: "Sub-district deleted" });
});
