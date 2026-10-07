/**
 * Offline tests (no database): `npm test`.
 * Covers the pure logic added for the vendor / user app plan - pricing, discounts, hot-deal rules,
 * approval after a product update, banner timers, feature settings, image classification, cursors.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

// --- stub the DB-backed settings before anything reads them --------------------------------
const { AppConfig } = require("../models");
let fakeConfig = {};
AppConfig.findOne = () => ({
  select: () => ({ lean: async () => fakeConfig }),
  lean: async () => fakeConfig,
});

const { normalizeFeatureSettings, DEFAULT_FEATURE_SETTINGS, invalidateFeatureSettingsCache, getFeatureSettings } =
  require("../utils/appFeatureSettings");
const { getActiveVenueDiscount, calculateBookingDiscount, parseDiscountInput } = require("../utils/venueDiscount");
const { productMatchesRule, isRuleLive, productDiscountPercent } = require("../utils/hotDeals");
const { resolveItemApprovalForVendor } = require("../utils/vendorApproval");
const { toPublicBanner } = require("../utils/mobilePresenters");
const { classifyImage } = require("../utils/imageNormalize");
const { toPublicProductListCard } = require("../utils/publicProductList");
const { nameTokenClause } = require("../utils/homeFeed");

async function withConfig(config, fn) {
  fakeConfig = config;
  invalidateFeatureSettingsCache();
  try {
    return await fn();
  } finally {
    fakeConfig = {};
    invalidateFeatureSettingsCache();
  }
}

// --- feature settings ----------------------------------------------------------------------
test("feature settings: defaults apply and bad values are coerced", () => {
  const defaults = normalizeFeatureSettings({});
  assert.equal(defaults.venueBookingMode, "enquiry");
  assert.equal(defaults.phonePlanRequired, true);

  const merged = normalizeFeatureSettings({ venueBookingMode: "nonsense", hotDealsLimit: "7", videoEnabledUser: false });
  assert.equal(merged.venueBookingMode, DEFAULT_FEATURE_SETTINGS.venueBookingMode);
  assert.equal(merged.hotDealsLimit, 7);
  assert.equal(merged.videoEnabledUser, false);
});

test("feature settings: profile module art overrides are sanitised", () => {
  const settings = normalizeFeatureSettings({
    profileModules: { bank: { icon: "bank", color: "#112233", image: "/uploads/x.png" }, evil: { icon: "x" }, personal: { color: "red" } },
  });
  assert.deepEqual(settings.profileModules.bank, { icon: "bank", color: "#112233", image: "/uploads/x.png" });
  assert.equal(settings.profileModules.evil, undefined);
  assert.equal(settings.profileModules.personal, undefined); // invalid colour, nothing else set
});

// --- venue discount ------------------------------------------------------------------------
const venue = { dayPrice: 10000, priceType: "day", discountType: "percentage", discountValue: 20 };

test("venue discount: percentage scales with the booking fee", () => {
  assert.equal(calculateBookingDiscount(venue, 20000), 4000);
});

test("venue discount: flat applies once and never exceeds the fee", () => {
  const flat = { ...venue, discountType: "flat", discountValue: 1500 };
  assert.equal(calculateBookingDiscount(flat, 20000), 1500);
  assert.equal(calculateBookingDiscount(flat, 1000), 1000);
});

test("venue discount: expired or not-yet-started discounts are ignored", () => {
  const past = { ...venue, discountEndsAt: new Date(Date.now() - 1000) };
  const future = { ...venue, discountStartsAt: new Date(Date.now() + 60_000) };
  assert.equal(getActiveVenueDiscount(past), null);
  assert.equal(getActiveVenueDiscount(future), null);
  assert.ok(getActiveVenueDiscount(venue));
});

test("venue discount: input validation", () => {
  assert.throws(() => parseDiscountInput({ discountType: "percentage", discountValue: 150 }, venue));
  assert.throws(() => parseDiscountInput({ discountType: "banana", discountValue: 10 }, venue));
});

// --- hot deals -----------------------------------------------------------------------------
const baseProduct = {
  status: "active",
  adminApproved: true,
  stock: 10,
  price: 1000,
  discountType: "percentage",
  discountValue: 25,
  variantType: "single",
  category: "c1",
  addedById: "v1",
};

test("hot deals: discount percent is derived from price", () => {
  assert.equal(productDiscountPercent(baseProduct), 25);
  assert.equal(productDiscountPercent({ ...baseProduct, discountValue: 0 }), 0);
});

test("hot deals: rule conditions (discount, stock, price band, category, vendor)", () => {
  const rule = { minDiscountPercent: 20, minStock: 5, minPrice: 500, maxPrice: 2000, categories: ["c1"], vendors: ["v1"] };
  assert.equal(productMatchesRule(baseProduct, rule), true);
  assert.equal(productMatchesRule({ ...baseProduct, discountValue: 10 }, rule), false);
  assert.equal(productMatchesRule({ ...baseProduct, stock: 2 }, rule), false);
  assert.equal(productMatchesRule({ ...baseProduct, price: 3000 }, rule), false);
  assert.equal(productMatchesRule({ ...baseProduct, category: "c2" }, rule), false);
  assert.equal(productMatchesRule({ ...baseProduct, addedById: "v2" }, rule), false);
  assert.equal(productMatchesRule({ ...baseProduct, adminApproved: false }, rule), false);
});

test("hot deals: rule is only live inside its dates and daily window", () => {
  const now = new Date();
  assert.equal(isRuleLive({ status: "active" }, now), true);
  assert.equal(isRuleLive({ status: "inactive" }, now), false);
  assert.equal(isRuleLive({ status: "active", endsAt: new Date(now.getTime() - 1000) }, now), false);
  assert.equal(isRuleLive({ status: "active", startsAt: new Date(now.getTime() + 60_000) }, now), false);
});

// --- product update verification -----------------------------------------------------------
test("approval after update: trusted vendors stay live, untrusted go back to review", async () => {
  await withConfig({ vendor_approval_required: true }, async () => {
    const trusted = await resolveItemApprovalForVendor({ approvalStatus: "approved", status: "active" });
    assert.equal(trusted.adminApproved, true);
    assert.equal(trusted.catalogStatus, "active");

    const pendingVendor = await resolveItemApprovalForVendor({ approvalStatus: "pending", status: "active" });
    assert.equal(pendingVendor.adminApproved, false);
    assert.equal(pendingVendor.catalogStatus, "pending");
  });
});

test("approval after update: trust can be switched off by admin", async () => {
  await withConfig({ vendor_approval_required: true, feature_settings: { autoApproveTrustedVendors: false } }, async () => {
    const result = await resolveItemApprovalForVendor({ approvalStatus: "approved", status: "active" });
    assert.equal(result.adminApproved, false);
  });
});

test("approval after update: nothing to review when approval is off globally", async () => {
  await withConfig({ vendor_approval_required: false }, async () => {
    const result = await resolveItemApprovalForVendor({ approvalStatus: "pending", status: "active" });
    assert.equal(result.adminApproved, true);
  });
});

test("settings cache reloads after invalidation (admin edits take effect)", async () => {
  await withConfig({ feature_settings: { hotDealsLimit: 3 } }, async () => {
    assert.equal((await getFeatureSettings()).hotDealsLimit, 3);
  });
  await withConfig({ feature_settings: { hotDealsLimit: 9 } }, async () => {
    assert.equal((await getFeatureSettings()).hotDealsLimit, 9);
  });
});

// --- product cards -------------------------------------------------------------------------
test("product card: discount %, savings, badges and stock flags", () => {
  const card = toPublicProductListCard(
    { ...baseProduct, _id: "p1", name: "X", slug: "x", sku: "S", thumbnail: "/uploads/a.jpg", stock: 3, createdAt: new Date(), hotDeal: { status: "approved" } },
    { _id: "v1", businessName: "Shiv Shakti" },
    "http://h"
  );
  assert.equal(card.discountPercent, 25);
  assert.equal(card.discountLabel, "25% OFF");
  assert.equal(card.lowStock, true);
  assert.equal(card.isNew, true);
  assert.equal(card.isHotDeal, true);
  assert.deepEqual(card.badges.map((b) => b.key), ["hot_deal", "discount", "new", "low_stock"]);
});

// --- banners -------------------------------------------------------------------------------
test("banner: timer block counts down to timerEndsAt, falls back to end of endDate", () => {
  const endsAt = new Date(Date.now() + 3600_000);
  const withTimer = toPublicBanner({ title: "t", image: "/a.jpg", showTimer: true, timerEndsAt: endsAt }, "http://h");
  assert.ok(withTimer.timer.remainingSeconds > 3500 && withTimer.timer.remainingSeconds <= 3600);

  const fromEndDate = toPublicBanner({ title: "t", image: "/a.jpg", showTimer: true, endDate: new Date(Date.now() + 86_400_000) }, "http://h");
  assert.ok(fromEndDate.timer.remainingSeconds > 0);

  assert.equal(toPublicBanner({ title: "t", image: "/a.jpg" }, "http://h").timer, null);
});

test("banner: stored size gives the app an aspect ratio", () => {
  const banner = toPublicBanner({ title: "t", image: "/a.jpg", imageWidth: 800, imageHeight: 300 }, "http://h");
  assert.equal(banner.aspectRatio, 2.667);
});

// --- image classification ------------------------------------------------------------------
test("image classification: thumbnail vs banner vs tiny", () => {
  assert.equal(classifyImage({ width: 800, height: 800, aspectRatio: 1 }).suitableAsThumbnail, true);
  assert.equal(classifyImage({ width: 1600, height: 500, aspectRatio: 3.2 }).kind, "banner");
  assert.equal(classifyImage({ width: 400, height: 900, aspectRatio: 0.444 }).kind, "portrait");
  assert.equal(classifyImage({ width: 120, height: 120, aspectRatio: 1 }).kind, "low_quality");
});

// --- vendor-aware search -------------------------------------------------------------------
test("search: every word must match, in any order and case", () => {
  const clause = nameTokenClause("businessName", "shiv  SHAKTI");
  assert.equal(clause.$and.length, 2);
  const matches = (name) => clause.$and.every((c) => c.businessName.$regex && new RegExp(c.businessName.$regex, "i").test(name));
  assert.equal(matches("Shiv Shakti Store"), true);
  assert.equal(matches("Shakti Shiv Mart"), true);
  assert.equal(matches("Shiv Sai"), false);
  assert.equal(nameTokenClause("name", "   "), null);
});
