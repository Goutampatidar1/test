const mongoose = require("mongoose");
const HotDealRule = require("../models/other/hotDealRule");
const Product = require("../models/other/product");
const { activePublicProductBaseFilter, resolveProductSellingPrice } = require("./publicProductList");
const { getFeatureSettings } = require("./appFeatureSettings");
const { queueNotifyAllAdmins } = require("./adminInbox");

const CANDIDATE_CAP = 300;
const DEAL_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

/** Hour (0–23) in the business timezone; the server itself usually runs on UTC. */
function localHour(now) {
  const hour = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: DEAL_TIMEZONE }).format(now);
  return Number(hour) % 24;
}

function productDiscountPercent(product) {
  const { price, mrp } = resolveProductSellingPrice(product);
  if (!(mrp > 0) || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function toIds(list) {
  return (list || []).map((id) => new mongoose.Types.ObjectId(String(id)));
}

function isRuleLive(rule, now = new Date()) {
  if (!rule || rule.status !== "active") return false;
  if (rule.startsAt && new Date(rule.startsAt) > now) return false;
  if (rule.endsAt && new Date(rule.endsAt) < now) return false;
  const start = rule.dailyStartHour;
  const end = rule.dailyEndHour;
  if (Number.isInteger(start) && Number.isInteger(end)) {
    const hour = localHour(now);
    const inside = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
    if (!inside) return false;
  }
  return true;
}

/** Mongo-expressible part of a rule (discount percent is checked afterwards in JS). */
function buildRuleFilter(rule) {
  const filter = activePublicProductBaseFilter({ role: "Vendor" });
  filter.stock = { $gte: Math.max(1, Number(rule.minStock) || 1) };
  filter.$or = [{ discountValue: { $gt: 0 } }, { "combinations.discountValue": { $gt: 0 } }];
  // Only products the vendor asked for and admin approved; the rule's requireOptIn flag is ignored.
  filter["hotDeal.optIn"] = true;
  filter["hotDeal.status"] = "approved";
  if (rule.categories?.length) filter.category = { $in: toIds(rule.categories) };
  if (rule.subCategories?.length) filter.subCategory = { $in: toIds(rule.subCategories) };
  if (rule.vendors?.length) filter.addedById = { $in: toIds(rule.vendors) };
  if (Number(rule.minPrice) > 0 || Number(rule.maxPrice) > 0) {
    filter.price = {};
    if (Number(rule.minPrice) > 0) filter.price.$gte = Number(rule.minPrice);
    if (Number(rule.maxPrice) > 0) filter.price.$lte = Number(rule.maxPrice);
  }
  return filter;
}

function productMatchesRule(product, rule) {
  if (!product || product.status !== "active" || !product.adminApproved) return false;
  if (Number(product.stock) < Math.max(1, Number(rule.minStock) || 1)) return false;
  if (rule.categories?.length && !rule.categories.some((id) => String(id) === String(product.category))) {
    return false;
  }
  if (
    rule.subCategories?.length &&
    !rule.subCategories.some((id) => String(id) === String(product.subCategory))
  ) {
    return false;
  }
  if (rule.vendors?.length && !rule.vendors.some((id) => String(id) === String(product.addedById))) {
    return false;
  }
  const price = Number(product.price) || 0;
  if (Number(rule.minPrice) > 0 && price < Number(rule.minPrice)) return false;
  if (Number(rule.maxPrice) > 0 && price > Number(rule.maxPrice)) return false;
  return productDiscountPercent(product) >= (Number(rule.minDiscountPercent) || 0);
}

async function listLiveRules(now = new Date()) {
  const rules = await HotDealRule.find({ status: "active" }).sort({ priority: -1, createdAt: 1 }).lean();
  return rules.filter((rule) => isRuleLive(rule, now));
}

/** Which live rules a product currently satisfies (for approval screens and badges). */
async function matchingRulesForProduct(product) {
  const rules = await listLiveRules();
  return rules.filter((rule) => productMatchesRule(product, rule));
}

/**
 * Vendor opts a product in/out. Opt-in goes to the admin queue unless a matching rule auto-approves.
 * Returns the resulting hotDeal state (caller saves the product).
 */
async function applyHotDealOptIn(product, optIn) {
  const wantsIn = optIn === true || optIn === "true" || optIn === 1 || optIn === "1";

  if (!wantsIn) {
    product.hotDeal = { optIn: false, status: "none", requestedAt: null, reviewedAt: null, rejectionReason: "", rule: null };
    return product.hotDeal;
  }
  if (product.hotDeal?.optIn && ["pending", "approved"].includes(product.hotDeal?.status)) {
    return product.hotDeal; // already in the flow
  }

  const rules = await listLiveRules();
  const autoRule = rules.find((rule) => rule.autoApprove && productMatchesRule(product, rule));
  const now = new Date();
  product.hotDeal = {
    optIn: true,
    status: autoRule && product.adminApproved ? "approved" : "pending",
    requestedAt: now,
    reviewedAt: autoRule && product.adminApproved ? now : null,
    rejectionReason: "",
    rule: autoRule?._id ?? null,
  };
  return product.hotDeal;
}

function notifyAdminsHotDealPending(product, vendorId) {
  queueNotifyAllAdmins({
    type: "hot_deal_pending_approval",
    title: "Hot deal request",
    message: `${product.name} was submitted for Hot Deals.`,
    metadata: {
      event: "hot_deal_pending_approval",
      productId: String(product._id),
      vendorId: String(vendorId || ""),
      linkPath: `/admin/hot-deals/queue`,
    },
  });
}

/**
 * Live hot deals: products an admin approved from the opt-in queue, plus products that satisfy
 * at least one live rule (best discount first).
 */
async function listHotDealProducts({ limit } = {}) {
  const settings = await getFeatureSettings();
  if (!settings.hotDealsEnabled) return [];
  const requested = Math.trunc(Number(limit));

  const rules = await listLiveRules();
  const picked = new Map();

  const consider = (product, rule) => {
    const key = String(product._id);
    const percent = productDiscountPercent(product);
    const existing = picked.get(key);
    if (!existing || percent > existing.percent) {
      picked.set(key, { product, percent, rule });
    }
  };

  const approved = await Product.find({
    ...activePublicProductBaseFilter({ role: "Vendor" }),
    "hotDeal.optIn": true,
    "hotDeal.status": "approved",
    stock: { $gte: 1 },
  })
    .populate("category", "name mode status")
    .populate("subCategory", "name status")
    .limit(CANDIDATE_CAP)
    .lean();
  approved.forEach((product) => consider(product, null));

  for (const rule of rules) {
    const candidates = await Product.find(buildRuleFilter(rule))
      .populate("category", "name mode status")
      .populate("subCategory", "name status")
      .limit(CANDIDATE_CAP)
      .lean();
    candidates
      .filter((product) => productDiscountPercent(product) >= (Number(rule.minDiscountPercent) || 0))
      .sort((a, b) => productDiscountPercent(b) - productDiscountPercent(a))
      .slice(0, Number(rule.limit) || 12)
      .forEach((product) => consider(product, rule));
  }

  const sorted = [...picked.values()].sort((a, b) => b.percent - a.percent);
  return requested > 0 ? sorted.slice(0, requested) : sorted;
}

module.exports = {
  productDiscountPercent,
  isRuleLive,
  buildRuleFilter,
  productMatchesRule,
  listLiveRules,
  matchingRulesForProduct,
  applyHotDealOptIn,
  notifyAdminsHotDealPending,
  listHotDealProducts,
};
