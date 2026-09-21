import { normalizePanelMode } from "./panelMode.js";

function unwrapApiPayload(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (Array.isArray(data.data) && data.data[0] && typeof data.data[0] === "object") {
      return data.data[0];
    }
    if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
      return data.data;
    }
    return data;
  }
  return data ?? {};
}

function deriveCapabilities(accounts, payloadCapabilities) {
  const fromPayload = Array.isArray(payloadCapabilities)
    ? payloadCapabilities.filter((cap) => cap === "ecom" || cap === "service")
    : [];
  if (fromPayload.length) return fromPayload;

  const derived = [];
  if (accounts?.ecom?.token) derived.push("ecom");
  if (accounts?.service?.token) derived.push("service");
  return derived;
}

function normalizeAccounts(rawAccounts, payload) {
  if (rawAccounts && typeof rawAccounts === "object" && Object.keys(rawAccounts).length > 0) {
    return rawAccounts;
  }

  const token = payload.token ?? null;
  const refreshToken = payload.refreshToken ?? null;
  const user = payload.user ?? null;
  if (!token || !user) return {};

  const vendorPanelType = payload.vendorPanelType;
  const approvalStatus = user.approvalStatus ?? null;
  const baseAccount = { token, refreshToken, user, approvalStatus };

  if (vendorPanelType === "both") {
    return {
      service: { ...baseAccount },
      ecom: { ...baseAccount },
    };
  }

  if (vendorPanelType === "ecom") {
    return { ecom: { ...baseAccount } };
  }

  return { service: { ...baseAccount } };
}

/** Normalize register/login/OTP responses into a consistent panel auth session. */
export function normalizePanelAuthSession(raw) {
  const payload = unwrapApiPayload(raw);
  const accounts = normalizeAccounts(payload.accounts, payload);
  const capabilities = deriveCapabilities(accounts, payload.capabilities);

  let panelMode = normalizePanelMode(payload.panelMode);
  const vendorPanelType =
    payload.vendorPanelType || (capabilities.length > 1 ? "both" : panelMode || "service");

  if (vendorPanelType === "both" && capabilities.includes("ecom") && capabilities.includes("service")) {
    panelMode = "both";
  } else if (capabilities.length === 1) {
    panelMode = capabilities[0];
  }

  const primary =
    (panelMode === "both" ? accounts.service || accounts.ecom : accounts[panelMode]) ||
    accounts.service ||
    accounts.ecom;

  return {
    token: payload.token ?? primary?.token ?? null,
    refreshToken: payload.refreshToken ?? primary?.refreshToken ?? null,
    user: payload.user ?? primary?.user ?? null,
    panelMode,
    capabilities,
    vendorPanelType,
    accounts,
    approvalRequired: payload.approvalRequired,
  };
}
