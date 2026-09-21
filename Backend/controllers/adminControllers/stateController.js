const State = require("../../models/other/state");
const City = require("../../models/other/city");
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

function assertStateNameFormat(name) {
  if (!/^[A-Za-z ]+$/.test(name)) {
    throw new AppError("State name can contain only letters and spaces", 400);
  }
}

function assertStateCodeFormat(code) {
  if (code && !/^[A-Za-z]+$/.test(code)) {
    throw new AppError("State code can contain only letters", 400);
  }
}

async function assertStateNameUnique(name, excludeId) {
  const exactNameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
  const filter = { name: exactNameRx };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await State.findOne(filter).select("_id").lean();
  if (exists) throw new AppError("State name already exists", 409);
}

exports.listStates = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, all } = req.query;

  const filter = {};
  if (status) {
    if (!ALLOWED_STATUS.has(String(status))) throw new AppError("Invalid status filter", 400);
    filter.status = String(status);
  }
  const searchOr = searchFilter(search, ["name", "code"]);
  if (searchOr) Object.assign(filter, searchOr);

  const query = State.find(filter).sort({ name: 1 });
  if (all !== "true" && all !== "1") {
    query.skip(skip).limit(limit);
  }

  const [states, total] = await Promise.all([
    query.lean(),
    State.countDocuments(filter),
  ]);

  res.json({
    states,
    pagination: {
      page: all === "true" || all === "1" ? 1 : page,
      limit: all === "true" || all === "1" ? total : limit,
      total,
      pages: all === "true" || all === "1" ? 1 : Math.ceil(total / limit) || 1,
    },
  });
});

exports.getStateById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const state = await State.findById(req.params.id).lean();
  if (!state) throw new AppError("State not found", 404);
  res.json({ state });
});

exports.createState = asyncHandler(async (req, res) => {
  const name = normalizeRequired(req.body.name);
  const code = normalizeOptional(req.body.code);
  const status = normalizeRequired(req.body.status || "active");

  if (!name) throw new AppError("State name is required", 400);
  if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
  assertStateNameFormat(name);
  assertStateCodeFormat(code);

  await assertStateNameUnique(name);

  const state = await State.create({
    name,
    ...(code ? { code: code.toUpperCase() } : {}),
    status,
  });

  res.status(201).json({ message: "State created", state });
});

exports.updateState = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const state = await State.findById(req.params.id);
  if (!state) throw new AppError("State not found", 404);

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    const name = normalizeRequired(req.body.name);
    if (!name) throw new AppError("State name cannot be empty", 400);
    assertStateNameFormat(name);
    await assertStateNameUnique(name, state._id);
    state.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "code")) {
    const code = normalizeOptional(req.body.code);
    assertStateCodeFormat(code);
    state.code = code ? code.toUpperCase() : null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const status = normalizeRequired(req.body.status);
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    state.status = status;
  }

  await state.save();
  res.json({ message: "State updated", state });
});

exports.deleteState = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const state = await State.findById(req.params.id);
  if (!state) throw new AppError("State not found", 404);

  const cityCount = await City.countDocuments({ state: state._id });
  if (cityCount > 0) {
    throw new AppError("Cannot delete state with existing cities", 409);
  }

  await State.findByIdAndDelete(state._id);
  res.json({ message: "State deleted" });
});
