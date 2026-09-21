const VendorPlan = require("../../models/other/vendorPlan");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const ALLOWED_PLAN_TYPES = new Set(["banner", "get_verified", "product_presence_first"]);
const ALLOWED_VENDOR_TYPES = new Set(["ecom", "venue", "both"]);
const ALLOWED_PRESENCE_MODES = new Set(["random"]);

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function parseNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new AppError(`${fieldName} must be a valid number`, 400);
  }
  return n;
}

function parsePositiveInt(value, fieldName, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }
  return n;
}

function parseDateOrThrow(value, fieldName) {
  const raw = normalizeRequired(value);
  if (!raw) throw new AppError(`${fieldName} is required`, 400);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }
  return date;
}

function assertDateRange(startDate, endDate) {
  if (startDate > endDate) {
    throw new AppError("Start date cannot be after end date", 400);
  }
}

function buildPlanPayload(body, { partial = false } = {}) {
  const payload = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = normalizeRequired(body.name);
    if (!name) throw new AppError("Plan name is required", 400);
    payload.name = name;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "planType")) {
    const planType = normalizeRequired(body.planType);
    if (!ALLOWED_PLAN_TYPES.has(planType)) {
      throw new AppError("Invalid plan type", 400);
    }
    payload.planType = planType;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "vendorType")) {
    const vendorType = normalizeRequired(body.vendorType || "both");
    if (!ALLOWED_VENDOR_TYPES.has(vendorType)) {
      throw new AppError("Invalid vendor type", 400);
    }
    payload.vendorType = vendorType;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "price")) {
    const price = parseNonNegativeNumber(body.price, "Price");
    if (price === null && !partial) throw new AppError("Price is required", 400);
    if (price !== null) payload.price = price;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "startDate")) {
    payload.startDate = parseDateOrThrow(body.startDate, "Start date");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "endDate")) {
    payload.endDate = parseDateOrThrow(body.endDate, "End date");
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "presenceTopLimit")) {
    payload.presenceTopLimit = parsePositiveInt(
      body.presenceTopLimit,
      "Presence top limit",
      partial ? undefined : 100
    );
    if (payload.presenceTopLimit === undefined) delete payload.presenceTopLimit;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "presenceMode")) {
    const presenceMode = normalizeRequired(body.presenceMode || "random");
    if (!ALLOWED_PRESENCE_MODES.has(presenceMode)) {
      throw new AppError("Invalid presence mode", 400);
    }
    payload.presenceMode = presenceMode;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = normalizeRequired(body.status || "active");
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    payload.status = status;
  }

  return payload;
}

function resolveDateRange(existing, payload) {
  const startDate = payload.startDate ?? existing?.startDate;
  const endDate = payload.endDate ?? existing?.endDate;
  if (startDate && endDate) {
    assertDateRange(new Date(startDate), new Date(endDate));
  }
}

exports.listPlans = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, planType, vendorType } = req.query;

  const filter = {};
  if (status && String(status).trim()) {
    const normalized = String(status).trim();
    if (!ALLOWED_STATUS.has(normalized)) throw new AppError("Invalid status filter", 400);
    filter.status = normalized;
  }
  if (planType && String(planType).trim()) {
    const normalized = String(planType).trim();
    if (!ALLOWED_PLAN_TYPES.has(normalized)) throw new AppError("Invalid plan type filter", 400);
    filter.planType = normalized;
  }
  if (vendorType && String(vendorType).trim()) {
    const normalized = String(vendorType).trim();
    if (!ALLOWED_VENDOR_TYPES.has(normalized) && normalized !== "all") {
      throw new AppError("Invalid vendor type filter", 400);
    }
    if (normalized !== "all") filter.vendorType = normalized;
  }

  const searchOr = searchFilter(search, ["name", "planType"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [plans, total] = await Promise.all([
    VendorPlan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    VendorPlan.countDocuments(filter),
  ]);

  res.json({
    plans,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getPlanById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const plan = await VendorPlan.findById(req.params.id).lean();
  if (!plan) throw new AppError("Plan not found", 404);
  res.json({ plan });
});

exports.createPlan = asyncHandler(async (req, res) => {
  const payload = buildPlanPayload(req.body, { partial: false });
  resolveDateRange(null, payload);
  if (payload.planType !== "product_presence_first") {
    payload.presenceTopLimit = payload.presenceTopLimit ?? 100;
    payload.presenceMode = payload.presenceMode || "random";
  }
  const plan = await VendorPlan.create(payload);
  res.status(201).json({ message: "Plan created", plan });
});

exports.updatePlan = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const plan = await VendorPlan.findById(req.params.id);
  if (!plan) throw new AppError("Plan not found", 404);

  const payload = buildPlanPayload(req.body, { partial: true });
  resolveDateRange(plan, payload);
  Object.assign(plan, payload);
  await plan.save();
  res.json({ message: "Plan updated", plan });
});

exports.deletePlan = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const plan = await VendorPlan.findById(req.params.id);
  if (!plan) throw new AppError("Plan not found", 404);
  await VendorPlan.findByIdAndDelete(plan._id);
  res.json({ message: "Plan deleted" });
});
