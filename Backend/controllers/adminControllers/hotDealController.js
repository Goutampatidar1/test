const HotDealRule = require("../../models/other/hotDealRule");
const Product = require("../../models/other/product");
const AppError = require("../../utils/AppError");
const { asyncHandler } = require("../../utils/asyncHandler");
const { assertObjectId } = require("../../utils/assertObjectId");
const { getPagination } = require("../../utils/listQuery");
const { getPublicBaseUrl, toAbsoluteUploadUrl } = require("../../utils/mediaUrl");
const { queueAppNotification } = require("../../utils/appNotify");
const {
  productDiscountPercent,
  matchingRulesForProduct,
  listHotDealProducts,
} = require("../../utils/hotDeals");

const RULE_NUMBER_FIELDS = ["minDiscountPercent", "minPrice", "maxPrice", "minStock", "limit", "priority"];
const RULE_BOOL_FIELDS = ["requireOptIn", "autoApprove"];
const RULE_ID_LISTS = ["categories", "subCategories", "vendors"];

function toBool(value) {
  return value === true || ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function parseIdList(value, label) {
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = list.split(",");
    }
  }
  if (!Array.isArray(list)) return [];
  const ids = list.map((row) => String(row).trim()).filter(Boolean);
  ids.forEach((id) => assertObjectId(id, `Invalid ${label} id`));
  return ids;
}

function buildRulePayload(body, { partial = false } = {}) {
  const payload = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new AppError("Rule name is required", 400);
    payload.name = name.slice(0, 80);
  }
  for (const field of ["description", "badge"]) {
    if (body[field] !== undefined) payload[field] = String(body[field]).trim();
  }
  for (const field of RULE_NUMBER_FIELDS) {
    if (body[field] === undefined || body[field] === "") continue;
    const n = Number(body[field]);
    if (!Number.isFinite(n) || n < 0) throw new AppError(`${field} must be a non-negative number`, 400);
    payload[field] = n;
  }
  if (payload.minDiscountPercent > 100) throw new AppError("minDiscountPercent cannot exceed 100", 400);
  for (const field of RULE_BOOL_FIELDS) {
    if (body[field] !== undefined) payload[field] = toBool(body[field]);
  }
  for (const field of RULE_ID_LISTS) {
    if (body[field] !== undefined) payload[field] = parseIdList(body[field], field);
  }
  for (const field of ["startsAt", "endsAt"]) {
    if (body[field] === undefined) continue;
    if (body[field] === null || body[field] === "") {
      payload[field] = null;
    } else {
      const date = new Date(body[field]);
      if (Number.isNaN(date.getTime())) throw new AppError(`Invalid ${field}`, 400);
      payload[field] = date;
    }
  }
  for (const field of ["dailyStartHour", "dailyEndHour"]) {
    if (body[field] === undefined) continue;
    payload[field] = body[field] === null || body[field] === "" ? null : Number(body[field]);
  }
  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!["active", "inactive"].includes(status)) throw new AppError("Invalid status", 400);
    payload.status = status;
  }
  return payload;
}

// ---- rules CRUD -----------------------------------------------------------

exports.listRules = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status && req.query.status !== "all") filter.status = String(req.query.status);
  const rules = await HotDealRule.find(filter).sort({ priority: -1, createdAt: -1 }).lean();
  res.json({ rules });
});

exports.createRule = asyncHandler(async (req, res) => {
  const rule = await HotDealRule.create(buildRulePayload(req.body ?? {}));
  res.status(201).json({ message: "Hot deal rule created", rule });
});

exports.updateRule = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const rule = await HotDealRule.findById(req.params.id);
  if (!rule) throw new AppError("Rule not found", 404);
  Object.assign(rule, buildRulePayload(req.body ?? {}, { partial: true }));
  await rule.save();
  res.json({ message: "Hot deal rule updated", rule });
});

exports.deleteRule = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const rule = await HotDealRule.findByIdAndDelete(req.params.id);
  if (!rule) throw new AppError("Rule not found", 404);
  res.json({ message: "Hot deal rule deleted" });
});

// ---- approval queue -------------------------------------------------------

function toQueueRow(product, rules, baseUrl) {
  return {
    _id: product._id,
    name: product.name,
    thumbnail: toAbsoluteUploadUrl(product.thumbnail, baseUrl),
    price: product.price,
    stock: product.stock,
    discountType: product.discountType,
    discountValue: product.discountValue,
    discountPercent: productDiscountPercent(product),
    category: product.category && typeof product.category === "object" ? product.category : null,
    vendor: product.addedById && typeof product.addedById === "object" ? product.addedById : null,
    hotDeal: product.hotDeal,
    matchingRules: rules.map((rule) => ({ _id: rule._id, name: rule.name })),
    qualifies: rules.length > 0,
  };
}

exports.listQueue = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const status = String(req.query.status || "pending").trim();
  const filter = { "hotDeal.optIn": true };
  if (status !== "all") filter["hotDeal.status"] = status;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name")
      .populate("addedById", "businessName shopLogo")
      .sort({ "hotDeal.requestedAt": -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const rows = [];
  for (const product of products) {
    const rules = await matchingRulesForProduct({ ...product, addedById: product.addedById?._id ?? product.addedById, category: product.category?._id ?? product.category });
    rows.push(toQueueRow(product, rules, baseUrl));
  }

  res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

async function reviewProduct(req, res, nextStatus) {
  assertObjectId(req.params.productId, "Invalid product id");
  const product = await Product.findById(req.params.productId);
  if (!product || !product.hotDeal?.optIn) throw new AppError("Hot deal request not found", 404);

  if (nextStatus === "rejected") {
    const reason = String(req.body?.reason ?? "").trim();
    if (reason.length < 3) throw new AppError("A rejection reason is required", 400);
    product.hotDeal.rejectionReason = reason.slice(0, 300);
  } else {
    product.hotDeal.rejectionReason = "";
  }
  product.hotDeal.status = nextStatus;
  product.hotDeal.reviewedAt = new Date();
  await product.save();

  if (product.role === "Vendor") {
    queueAppNotification({
      recipientType: "vendor",
      recipientId: product.addedById,
      type: nextStatus === "approved" ? "hot_deal_approved" : "hot_deal_rejected",
      title: nextStatus === "approved" ? "Added to Hot Deals" : "Hot Deals request declined",
      message:
        nextStatus === "approved"
          ? `${product.name} is now featured in Hot Deals.`
          : `${product.name} was not accepted for Hot Deals: ${product.hotDeal.rejectionReason}`,
      metadata: { event: `hot_deal_${nextStatus}`, productId: String(product._id) },
    });
  }
  res.json({ message: `Hot deal ${nextStatus}`, productId: product._id, hotDeal: product.hotDeal });
}

exports.approveProduct = asyncHandler((req, res) => reviewProduct(req, res, "approved"));
exports.rejectProduct = asyncHandler((req, res) => reviewProduct(req, res, "rejected"));

/** Admin preview of what users will currently see. */
exports.previewLive = asyncHandler(async (req, res) => {
  const picked = await listHotDealProducts({ limit: req.query.limit });
  res.json({
    data: picked.map(({ product, percent, rule }) => ({
      _id: product._id,
      name: product.name,
      discountPercent: percent,
      rule: rule ? { _id: rule._id, name: rule.name } : null,
    })),
  });
});