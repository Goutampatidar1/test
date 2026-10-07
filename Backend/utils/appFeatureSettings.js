const { AppConfig } = require("../models");

/**
 * Admin-controlled feature switches stored in AppConfig.feature_settings.
 * Everything has a safe default so the app works before an admin touches it.
 */
const DEFAULT_HOME_SECTIONS = [
  { key: "banners", title: "Banners", enabled: true },
  { key: "categories", title: "Categories", enabled: true },
  { key: "video", title: "Videos", enabled: true },
  { key: "hotDeals", title: "Hot deals of the day", enabled: true },
  { key: "products", title: "Products", enabled: true },
  { key: "suggestions", title: "Suggested for you", enabled: true },
];

const DEFAULT_PROFILE_BENEFITS = [
  {
    minPercent: 40,
    title: "Get discovered",
    description: "Your services and products start appearing higher in search results.",
    icon: "search",
    perk: "ranking_boost",
  },
  {
    minPercent: 70,
    title: "Build trust",
    description: "A trusted-profile badge is shown to customers and you become eligible for Get Verified.",
    icon: "shield",
    perk: "get_verified_eligible",
  },
  {
    minPercent: 100,
    title: "Unlock rewards",
    description: "Complete profiles get the biggest ranking boost and a free trial of the Show Number plan.",
    icon: "gift",
    perk: "free_phone_trial",
  },
];

const DEFAULT_FEATURE_SETTINGS = {
  /** "enquiry" → user must send an enquiry and vendor must accept before booking. "direct" → instant booking. */
  venueBookingMode: "enquiry",
  /** Hours the user has to confirm and pay after the vendor accepts an enquiry. */
  enquiryBookingWindowHours: 24,
  /** Hours an unanswered enquiry stays open before it expires. */
  enquiryResponseHours: 48,
  /** Hold the enquired dates while an accepted enquiry waits for payment. */
  enquiryHoldDatesEnabled: true,
  /** Vendor must hold an active Show Number plan for the phone to be visible. */
  phonePlanRequired: true,
  /** Complimentary Show Number trial (days) granted at 100% profile completion. 0 disables. */
  phoneTrialDaysOnFullProfile: 7,
  videoEnabledUser: true,
  videoEnabledVendor: true,
  hotDealsEnabled: true,
  hotDealsLimit: 12,
  /** Minimum percent-off before wishlist/cart holders are alerted. */
  discountAlertMinPercent: 5,
  discountAlertCooldownHours: 24,
  /**
   * When admin approval is on, services/products from vendors whose account is already approved
   * go live immediately (profile completeness is never a gate).
   */
  autoApproveTrustedVendors: true,
  homeSections: DEFAULT_HOME_SECTIONS,
  profileBenefits: DEFAULT_PROFILE_BENEFITS,
};

let cache = { value: null, at: 0 };
const CACHE_TTL_MS = 30 * 1000;

function toBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;
  return fallback;
}

function toNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeHomeSections(value) {
  const input = Array.isArray(value) ? value : [];
  const known = new Map(DEFAULT_HOME_SECTIONS.map((row) => [row.key, row]));
  const out = [];
  const seen = new Set();

  for (const row of input) {
    const key = String(row?.key ?? row ?? "").trim();
    if (!known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      title: String(row?.title ?? known.get(key).title).trim() || known.get(key).title,
      enabled: toBool(row?.enabled, true),
    });
  }

  for (const row of DEFAULT_HOME_SECTIONS) {
    if (!seen.has(row.key)) out.push({ ...row });
  }
  return out;
}

function normalizeProfileBenefits(value) {
  const input = Array.isArray(value) ? value : DEFAULT_PROFILE_BENEFITS;
  return input
    .map((row) => ({
      minPercent: toNumber(row?.minPercent, 0, { min: 0, max: 100 }),
      title: String(row?.title ?? "").trim(),
      description: String(row?.description ?? "").trim(),
      icon: String(row?.icon ?? "star").trim() || "star",
      image: String(row?.image ?? "").trim(),
      perk: String(row?.perk ?? "").trim(),
    }))
    .filter((row) => row.title)
    .sort((a, b) => a.minPercent - b.minPercent);
}

const PROFILE_MODULE_IDS = ["personal", "business", "shopMedia", "bank", "documents", "services", "products"];

/** Admin overrides for the icon / colour / illustration of each profile module. */
function normalizeProfileModules(value) {
  const src = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const id of PROFILE_MODULE_IDS) {
    const row = src[id];
    if (!row || typeof row !== "object") continue;
    const entry = {};
    if (String(row.icon ?? "").trim()) entry.icon = String(row.icon).trim().slice(0, 40);
    if (/^#[0-9a-fA-F]{3,8}$/.test(String(row.color ?? "").trim())) entry.color = String(row.color).trim();
    if (String(row.image ?? "").trim()) entry.image = String(row.image).trim();
    if (Object.keys(entry).length) out[id] = entry;
  }
  return out;
}

/** Merge stored overrides on top of defaults and coerce types. */
function normalizeFeatureSettings(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_FEATURE_SETTINGS;
  const mode = String(src.venueBookingMode ?? d.venueBookingMode).trim().toLowerCase();

  return {
    venueBookingMode: mode === "direct" ? "direct" : "enquiry",
    enquiryBookingWindowHours: toNumber(src.enquiryBookingWindowHours, d.enquiryBookingWindowHours, {
      min: 1,
      max: 24 * 14,
    }),
    enquiryResponseHours: toNumber(src.enquiryResponseHours, d.enquiryResponseHours, {
      min: 1,
      max: 24 * 30,
    }),
    enquiryHoldDatesEnabled: toBool(src.enquiryHoldDatesEnabled, d.enquiryHoldDatesEnabled),
    phonePlanRequired: toBool(src.phonePlanRequired, d.phonePlanRequired),
    phoneTrialDaysOnFullProfile: toNumber(src.phoneTrialDaysOnFullProfile, d.phoneTrialDaysOnFullProfile, {
      min: 0,
      max: 365,
    }),
    videoEnabledUser: toBool(src.videoEnabledUser, d.videoEnabledUser),
    videoEnabledVendor: toBool(src.videoEnabledVendor, d.videoEnabledVendor),
    autoApproveTrustedVendors: toBool(src.autoApproveTrustedVendors, d.autoApproveTrustedVendors),
    hotDealsEnabled: toBool(src.hotDealsEnabled, d.hotDealsEnabled),
    hotDealsLimit: toNumber(src.hotDealsLimit, d.hotDealsLimit, { min: 1, max: 50 }),
    discountAlertMinPercent: toNumber(src.discountAlertMinPercent, d.discountAlertMinPercent, {
      min: 0,
      max: 100,
    }),
    discountAlertCooldownHours: toNumber(src.discountAlertCooldownHours, d.discountAlertCooldownHours, {
      min: 0,
      max: 24 * 30,
    }),
    homeSections: normalizeHomeSections(src.homeSections),
    profileBenefits: normalizeProfileBenefits(src.profileBenefits),
    profileModules: normalizeProfileModules(src.profileModules),
  };
}

function invalidateFeatureSettingsCache() {
  cache = { value: null, at: 0 };
}

async function getFeatureSettings({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache.value && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  let stored = {};
  try {
    const config = await AppConfig.findOne().select("feature_settings").lean();
    stored = config?.feature_settings || {};
  } catch {
    stored = {};
  }
  const value = normalizeFeatureSettings(stored);
  cache = { value, at: now };
  return value;
}

/**
 * Synchronous read for hot paths (presenters). Returns the cached value, or defaults before the first load,
 * and refreshes in the background when stale.
 */
function peekFeatureSettings() {
  if (!cache.value || Date.now() - cache.at >= CACHE_TTL_MS) {
    getFeatureSettings().catch(() => {});
  }
  return cache.value || normalizeFeatureSettings({});
}

/** Subset safe to expose to mobile/web clients without auth. */
function toPublicFeatureSettings(settings) {
  return {
    venueBookingMode: settings.venueBookingMode,
    enquiryBookingWindowHours: settings.enquiryBookingWindowHours,
    phonePlanRequired: settings.phonePlanRequired,
    videoEnabledUser: settings.videoEnabledUser,
    videoEnabledVendor: settings.videoEnabledVendor,
    hotDealsEnabled: settings.hotDealsEnabled,
    homeSections: settings.homeSections,
  };
}

module.exports = {
  DEFAULT_FEATURE_SETTINGS,
  normalizeFeatureSettings,
  getFeatureSettings,
  peekFeatureSettings,
  invalidateFeatureSettingsCache,
  toPublicFeatureSettings,
};
