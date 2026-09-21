const PromotionPlan = require("../../models/other/promotionPlan");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination, searchFilter } = require("../../utils/listQuery");
const { toPublicPromotionPlan } = require("../../utils/promotionEngine");

const ALLOWED_STATUS = new Set(["active", "inactive"]);
const ALLOWED_PLAN_TYPES = new Set(["banner", "get_verified", "product_presence_first"]);
const ALLOWED_VENDOR_TYPES = new Set(["ecom", "venue"]);
const ALLOWED_DURATION_TYPES = new Set(["daily", "weekly", "monthly"]);
const DEFAULT_DAYS = { daily: 1, weekly: 7, monthly: 30 };

function normalizeRequired(value) {
  return String(value ?? "").trim();
}

function parseDurationOptions(input) {
  let rows = input;
  if (typeof input === "string") {
    try {
      rows = JSON.parse(input);
    } catch {
      throw new AppError("durationOptions must be a valid JSON array", 400);
    }
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError("At least one duration option is required", 400);
  }

  const seen = new Set();
  const options = rows.map((row) => {
    const type = normalizeRequired(row?.type).toLowerCase();
    if (!ALLOWED_DURATION_TYPES.has(type)) {
      throw new AppError(`Invalid duration type: ${type}`, 400);
    }
    if (seen.has(type)) {
      throw new AppError(`Duplicate duration type: ${type}`, 400);
    }
    seen.add(type);

    let durationDays = Number(row?.durationDays);
    if (!Number.isFinite(durationDays) || durationDays < 1) {
      durationDays = DEFAULT_DAYS[type];
    }

    const price = Number(row?.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new AppError(`Invalid price for ${type}`, 400);
    }

    return { type, durationDays, price };
  });

  return options;
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
    if (!ALLOWED_PLAN_TYPES.has(planType)) throw new AppError("Invalid plan type", 400);
    payload.planType = planType;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "vendorType")) {
    const vendorType = normalizeRequired(body.vendorType || "ecom");
    if (!ALLOWED_VENDOR_TYPES.has(vendorType)) throw new AppError("Invalid vendor type", 400);
    payload.vendorType = vendorType;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "durationOptions")) {
    payload.durationOptions = parseDurationOptions(body.durationOptions);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "presenceTopLimit")) {
    if (body.presenceTopLimit === "" || body.presenceTopLimit === null || body.presenceTopLimit === undefined) {
      payload.presenceTopLimit = null;
    } else {
      const limit = Number(body.presenceTopLimit);
      if (![50, 100].includes(limit)) {
        throw new AppError("presenceTopLimit must be 50 or 100", 400);
      }
      payload.presenceTopLimit = limit;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = normalizeRequired(body.status || "active");
    if (!ALLOWED_STATUS.has(status)) throw new AppError("Invalid status", 400);
    payload.status = status;
  }

  return payload;
}

function assertPresenceLimit(payload, existing) {
  const vendorType = payload.vendorType || existing?.vendorType || "ecom";
  const planType = payload.planType || existing?.planType;
  if (vendorType === "venue" && planType !== "banner") {
    throw new AppError("Venue vendor plans can only use Banner Promotion", 400);
  }
  if (planType === "product_presence_first") {
    const limit = payload.presenceTopLimit !== undefined ? payload.presenceTopLimit : existing?.presenceTopLimit;
    if (![50, 100].includes(Number(limit))) {
      throw new AppError("Product Presence plans require presenceTopLimit 50 or 100", 400);
    }
  } else if (payload.planType && payload.planType !== "product_presence_first") {
    payload.presenceTopLimit = null;
  }
}

exports.listPlans = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status, search, planType, vendorType } = req.query;
  const filter = {};

  if (status && String(status).trim()) {
    if (!ALLOWED_STATUS.has(String(status).trim())) throw new AppError("Invalid status filter", 400);
    filter.status = String(status).trim();
  }
  if (planType && String(planType).trim()) {
    if (!ALLOWED_PLAN_TYPES.has(String(planType).trim())) throw new AppError("Invalid plan type filter", 400);
    filter.planType = String(planType).trim();
  }
  if (vendorType && String(vendorType).trim()) {
    if (!ALLOWED_VENDOR_TYPES.has(String(vendorType).trim())) throw new AppError("Invalid vendor type filter", 400);
    filter.vendorType = String(vendorType).trim();
  }
  const searchOr = searchFilter(search, ["name", "planType"]);
  if (searchOr) Object.assign(filter, searchOr);

  const [plans, total] = await Promise.all([
    PromotionPlan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PromotionPlan.countDocuments(filter),
  ]);

  res.json({
    plans: plans.map(toPublicPromotionPlan),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getPlanById = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const plan = await PromotionPlan.findById(req.params.id).lean();
  if (!plan) throw new AppError("Promotion plan not found", 404);
  res.json({ plan: toPublicPromotionPlan(plan) });
});

exports.createPlan = asyncHandler(async (req, res) => {
  const payload = buildPlanPayload(req.body, { partial: false });
  assertPresenceLimit(payload, null);
  const plan = await PromotionPlan.create(payload);
  res.status(201).json({ message: "Promotion plan created", plan: toPublicPromotionPlan(plan.toObject()) });
});

exports.updatePlan = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const plan = await PromotionPlan.findById(req.params.id);
  if (!plan) throw new AppError("Promotion plan not found", 404);

  const payload = buildPlanPayload(req.body, { partial: true });
  assertPresenceLimit(payload, plan);
  Object.assign(plan, payload);
  await plan.save();
  res.json({ message: "Promotion plan updated", plan: toPublicPromotionPlan(plan.toObject()) });
});

exports.deletePlan = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const plan = await PromotionPlan.findById(req.params.id);
  if (!plan) throw new AppError("Promotion plan not found", 404);
  await PromotionPlan.findByIdAndDelete(plan._id);
  res.json({ message: "Promotion plan deleted" });
});
