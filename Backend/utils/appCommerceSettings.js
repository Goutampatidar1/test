const City = require("../models/other/city");
const SubDistrict = require("../models/other/subDistrict");
const { AppConfig } = require("../models");

const FALLBACK_SHIPPING_CHARGE = Number(process.env.CART_SHIPPING_CHARGE) || 40;

const DEFAULT_ECOM_FLOW = Object.freeze({
  enabled: true,
  scope: "all",
  rule: "block",
  cities: [],
  pincodes: [],
  subDistricts: [],
});

const ALLOWED_ECOM_SCOPES = new Set(["all", "city", "pincode", "sub_district"]);
const ALLOWED_ECOM_RULES = new Set(["allow", "block"]);

function normalizePincode(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function defaultEcomFlow() {
  return {
    enabled: true,
    scope: "all",
    rule: "block",
    cities: [],
    pincodes: [],
    subDistricts: [],
  };
}

function normalizeEcomFlow(input) {
  const base = defaultEcomFlow();
  if (!input || typeof input !== "object") return base;

  const enabled = input.enabled === undefined ? base.enabled : Boolean(input.enabled);
  const scope = ALLOWED_ECOM_SCOPES.has(String(input.scope)) ? String(input.scope) : base.scope;
  const rule = ALLOWED_ECOM_RULES.has(String(input.rule)) ? String(input.rule) : base.rule;

  const cities = Array.isArray(input.cities)
    ? [...new Set(input.cities.map((id) => String(id).trim()).filter(Boolean))]
    : [];

  const subDistricts = Array.isArray(input.subDistricts)
    ? [...new Set(input.subDistricts.map((id) => String(id).trim()).filter(Boolean))]
    : [];

  const pincodes = Array.isArray(input.pincodes)
    ? [
        ...new Set(
          input.pincodes
            .map(normalizePincode)
            .filter((pin) => pin.length >= 4 && pin.length <= 10)
        ),
      ]
    : [];

  const normalized = {
    enabled,
    scope: enabled ? scope : "all",
    rule,
    cities: [],
    pincodes: [],
    subDistricts: [],
  };

  if (normalized.scope === "city") {
    normalized.cities = cities;
  } else if (normalized.scope === "pincode") {
    normalized.pincodes = pincodes;
  } else if (normalized.scope === "sub_district") {
    normalized.cities = cities;
    normalized.subDistricts = subDistricts;
  }

  return normalized;
}

function toPublicEcomFlow(doc) {
  const flow = normalizeEcomFlow(doc?.ecom_flow);
  return {
    enabled: flow.enabled,
    scope: flow.scope,
    rule: flow.rule,
  };
}

async function getConfiguredShippingCharge() {
  const config = await AppConfig.findOne().select("shipping_charge").lean();
  const value = Number(config?.shipping_charge);

  if (Number.isFinite(value) && value >= 0) {
    return value;
  }

  return FALLBACK_SHIPPING_CHARGE;
}

async function getEcomFlowSettings() {
  const config = await AppConfig.findOne().select("ecom_flow").lean();
  return normalizeEcomFlow(config?.ecom_flow);
}

async function resolveCityId({ cityId, cityName }) {
  if (cityId) return String(cityId);
  const name = String(cityName ?? "").trim();
  if (!name) return null;

  const city = await City.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    status: "active",
  })
    .select("_id")
    .lean();

  return city?._id ? String(city._id) : null;
}

async function resolveSubDistrictId({ subDistrictId, subDistrictName, cityId, cityName }) {
  if (subDistrictId) return String(subDistrictId);

  const name = String(subDistrictName ?? "").trim();
  if (!name) return null;

  const filter = {
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    status: "active",
  };

  const resolvedCityId = await resolveCityId({ cityId, cityName });
  if (resolvedCityId) filter.city = resolvedCityId;

  const subDistrict = await SubDistrict.findOne(filter).select("_id city").lean();
  return subDistrict?._id ? String(subDistrict._id) : null;
}

async function resolveEcomAvailability(
  { cityId, cityName, pincode, subDistrictId, subDistrictName } = {},
  configDoc = null
) {
  let flow = normalizeEcomFlow(configDoc?.ecom_flow);
  if (!configDoc) {
    flow = await getEcomFlowSettings();
  }

  if (!flow.enabled) {
    return {
      available: false,
      reason: "E-commerce is currently disabled.",
      ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
    };
  }

  if (flow.scope === "all") {
    return {
      available: true,
      reason: null,
      ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
    };
  }

  if (flow.scope === "city") {
    const resolvedCityId = await resolveCityId({ cityId, cityName });
    const citySet = new Set((flow.cities || []).map(String));
    const inList = resolvedCityId ? citySet.has(resolvedCityId) : false;

    if (flow.rule === "block") {
      return {
        available: !inList,
        reason: inList ? "E-commerce is not available in your city." : null,
        ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
      };
    }

    return {
      available: inList,
      reason: inList ? null : "E-commerce is not available in your city.",
      ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
    };
  }

  if (flow.scope === "pincode") {
    const normalizedPin = normalizePincode(pincode);
    const pinSet = new Set((flow.pincodes || []).map(normalizePincode));
    const inList = normalizedPin ? pinSet.has(normalizedPin) : false;

    if (flow.rule === "block") {
      return {
        available: !inList,
        reason: inList ? "E-commerce is not available for your pincode." : null,
        ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
      };
    }

    return {
      available: inList,
      reason: inList ? null : "E-commerce is not available for your pincode.",
      ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
    };
  }

  if (flow.scope === "sub_district") {
    const [resolvedCityId, resolvedSubDistrictId] = await Promise.all([
      resolveCityId({ cityId, cityName }),
      resolveSubDistrictId({ subDistrictId, subDistrictName, cityId, cityName }),
    ]);

    const citySet = new Set((flow.cities || []).map(String));
    const subDistrictSet = new Set((flow.subDistricts || []).map(String));
    let inList = false;

    if (resolvedSubDistrictId && subDistrictSet.has(resolvedSubDistrictId)) {
      inList = true;
    }

    if (resolvedCityId && citySet.has(resolvedCityId)) {
      inList = true;
    }

    if (!inList && resolvedSubDistrictId) {
      const subDistrict = await SubDistrict.findById(resolvedSubDistrictId).select("city").lean();
      if (subDistrict?.city && citySet.has(String(subDistrict.city))) {
        inList = true;
      }
    }

    if (flow.rule === "block") {
      return {
        available: !inList,
        reason: inList ? "Service is temporarily unavailable in your city." : null,
        ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
      };
    }

    return {
      available: inList,
      reason: inList ? null : "Service is temporarily unavailable in your city.",
      ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
    };
  }

  return {
    available: true,
    reason: null,
    ecom_flow: toPublicEcomFlow({ ecom_flow: flow }),
  };
}

const DEFAULT_PAYMENT_METHODS = [
  { type: "cod", isActive: true },
  { type: "online", isActive: false },
  { type: "wallet", isActive: true },
];

function mergePaymentMethods(methods) {
  const map = new Map();
  for (const row of Array.isArray(methods) ? methods : []) {
    if (!row?.type) continue;
    map.set(String(row.type).toLowerCase(), {
      type: String(row.type).toLowerCase(),
      isActive: row.isActive !== false,
    });
  }
  for (const row of DEFAULT_PAYMENT_METHODS) {
    if (!map.has(row.type)) map.set(row.type, { ...row });
  }
  return [...map.values()];
}

async function getPaymentMethodsConfig() {
  const config = await AppConfig.findOne().select("payment_methods").lean();
  return mergePaymentMethods(config?.payment_methods);
}

function isPaymentMethodEnabled(methods, paymentMethod) {
  const type = String(paymentMethod || "").toLowerCase();
  if (type === "wallet") return true;
  const row = methods.find((item) => String(item.type).toLowerCase() === type);
  if (!row) return type === "cod";
  return row.isActive !== false;
}

module.exports = {
  getConfiguredShippingCharge,
  FALLBACK_SHIPPING_CHARGE,
  DEFAULT_ECOM_FLOW,
  normalizePincode,
  normalizeEcomFlow,
  toPublicEcomFlow,
  getEcomFlowSettings,
  resolveEcomAvailability,
  mergePaymentMethods,
  getPaymentMethodsConfig,
  isPaymentMethodEnabled,
};
