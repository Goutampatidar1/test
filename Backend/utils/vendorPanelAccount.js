const { Vendor, VenueVendor } = require("../models");
const { normalizePhone, phoneLookupValues } = require("./phone");
const { toPublicProfile, toMobileVendorProfile } = require("./toPublicProfile");
const {
  signAccessToken,
  signRefreshToken,
  withTokenExpiryMeta,
} = require("./jwt");
const AppError = require("./AppError");

const VENDOR_PANEL_TYPES = new Set(["ecom", "service", "both"]);
const PANEL_MODES = new Set(["ecom", "service", "both"]);
const VENDOR_PANEL_OTP_PURPOSE = "vendor_panel_login";

function normalizeVendorPanelType(value) {
  const normalized = String(value ?? "service")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (normalized === "service_provider" || normalized === "venue") return "service";
  if (!VENDOR_PANEL_TYPES.has(normalized)) {
    throw new AppError("Invalid vendor type. Choose ecom, service, or both", 400);
  }
  return normalized;
}

function needsEcomAccount(vendorPanelType) {
  return vendorPanelType === "ecom" || vendorPanelType === "both";
}

function needsServiceAccount(vendorPanelType) {
  return vendorPanelType === "service" || vendorPanelType === "both";
}

async function findVendorByPhone(phoneRaw) {
  const phoneNorm = normalizePhone(phoneRaw);
  let vendor = await Vendor.findOne({ phone: phoneNorm });
  if (vendor) {
    return { vendor, phoneNorm };
  }

  const digits = String(phoneRaw ?? "").replace(/\D/g, "");
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    const variants = [last10, `91${last10}`, `+91${last10}`, `0${last10}`];
    vendor = await Vendor.findOne({ phone: { $in: variants } });
    if (vendor) {
      return { vendor, phoneNorm: last10 };
    }
  }

  return { vendor: null, phoneNorm };
}

async function findVenueVendorByPhone(phoneRaw) {
  const phoneNorm = normalizePhone(phoneRaw);
  const venueVendor = await VenueVendor.findOne({
    $or: [
      { phoneCanonical: phoneNorm },
      { phone: { $in: phoneLookupValues(phoneNorm) } },
    ],
  });
  return { venueVendor, phoneNorm };
}

async function findPanelAccountsByPhone(phoneRaw) {
  const [{ vendor }, { venueVendor, phoneNorm }] = await Promise.all([
    findVendorByPhone(phoneRaw),
    findVenueVendorByPhone(phoneRaw),
  ]);
  return { vendor, venueVendor, phoneNorm };
}

function assertPanelAccountCanAuthenticate(account, label = "Account") {
  if (!account) return;
  if (account.status === "blocked") {
    throw new AppError(`${label} is blocked`, 403);
  }
  if (account.status === "inactive") {
    throw new AppError(`${label} is inactive`, 403);
  }
  if (account.approvalStatus === "rejected") {
    const reason = String(account.rejectionReason || "").trim();
    throw new AppError(
      reason ? `${label} application was rejected: ${reason}` : `${label} application was rejected`,
      403
    );
  }
  if (account.approvalStatus === "suspended") {
    throw new AppError(`${label} is suspended`, 403);
  }
}

function issueEcomTokens(vendor) {
  const payload = { sub: vendor._id.toString(), role: "vendor" };
  return withTokenExpiryMeta({
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
}

function issueServiceTokens(venueVendor) {
  const payload = { sub: venueVendor._id.toString(), role: "venueVendor" };
  return withTokenExpiryMeta({
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
}

function serializeEcomAccount(vendor, req) {
  if (!vendor) return null;
  const tokens = issueEcomTokens(vendor);
  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
    user: toMobileVendorProfile(vendor, req),
    approvalStatus: vendor.approvalStatus,
  };
}

function serializeServiceAccount(venueVendor) {
  if (!venueVendor) return null;
  const tokens = issueServiceTokens(venueVendor);
  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    tokenExpiresIn: tokens.tokenExpiresIn,
    tokenExpiresAt: tokens.tokenExpiresAt,
    user: toPublicProfile(venueVendor),
    approvalStatus: venueVendor.approvalStatus,
  };
}

function resolveCapabilities(vendor, venueVendor) {
  const capabilities = [];
  if (vendor) capabilities.push("ecom");
  if (venueVendor) capabilities.push("service");
  return capabilities;
}

function resolveVendorPanelType(vendor, venueVendor) {
  const fromVendor = vendor?.vendorPanelType;
  const fromService = venueVendor?.vendorPanelType;
  if (fromVendor === "both" || fromService === "both") return "both";
  if (fromVendor && fromService && fromVendor !== fromService) return "both";
  if (vendor && venueVendor) return "both";
  return fromVendor || fromService || (vendor ? "ecom" : "service");
}

function defaultPanelMode(vendorPanelType, vendor, venueVendor) {
  if (vendor && venueVendor) return "both";
  if (vendorPanelType === "ecom" || (vendor && !venueVendor)) return "ecom";
  if (vendorPanelType === "service" || (!vendor && venueVendor)) return "service";
  return "service";
}

function buildPanelSession({ vendor, venueVendor, panelMode, req }) {
  const capabilities = resolveCapabilities(vendor, venueVendor);
  if (!capabilities.length) {
    throw new AppError("No vendor account found", 404);
  }

  const vendorPanelType = resolveVendorPanelType(vendor, venueVendor);
  const accounts = {
    ...(vendor ? { ecom: serializeEcomAccount(vendor, req) } : {}),
    ...(venueVendor ? { service: serializeServiceAccount(venueVendor) } : {}),
  };

  let activeMode = panelMode;
  if (!activeMode || !PANEL_MODES.has(activeMode)) {
    activeMode = defaultPanelMode(vendorPanelType, vendor, venueVendor);
  }
  if (activeMode !== "both" && !accounts[activeMode]) {
    activeMode = defaultPanelMode(vendorPanelType, vendor, venueVendor);
  }

  const primary = accounts[activeMode] || accounts.service || accounts.ecom;
  if (!primary) {
    throw new AppError("No vendor account found", 404);
  }

  return {
    capabilities,
    vendorPanelType,
    panelMode: activeMode,
    token: primary.token,
    refreshToken: primary.refreshToken,
    expiresIn: primary.expiresIn,
    tokenExpiresIn: primary.tokenExpiresIn,
    tokenExpiresAt: primary.tokenExpiresAt,
    user: primary.user,
    accounts,
  };
}

module.exports = {
  VENDOR_PANEL_OTP_PURPOSE,
  normalizeVendorPanelType,
  needsEcomAccount,
  needsServiceAccount,
  findVendorByPhone,
  findVenueVendorByPhone,
  findPanelAccountsByPhone,
  assertPanelAccountCanAuthenticate,
  issueEcomTokens,
  issueServiceTokens,
  serializeEcomAccount,
  serializeServiceAccount,
  resolveCapabilities,
  resolveVendorPanelType,
  defaultPanelMode,
  buildPanelSession,
};
