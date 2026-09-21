/** @typedef {"service" | "ecom" | "both"} PanelMode */
/** @typedef {"service" | "ecom"} ApiAccountMode */

export const PANEL_MODES = ["service", "ecom", "both"];

export function normalizePanelMode(mode) {
  if (mode === "ecom" || mode === "both") return mode;
  return "service";
}

/**
 * Pick vendor vs venue-vendor token when panel is in combined "both" mode.
 * @param {string} requestUrl axios config.url (path under /api)
 */
export function resolveApiModeFromRequestUrl(requestUrl) {
  const path = String(requestUrl || "").split("?")[0];
  if (path.startsWith("/vendor-panel/") || path.startsWith("/public/")) {
    return "service";
  }
  if (path.startsWith("/venue-vendor/")) {
    return "service";
  }
  if (path.startsWith("/vendor/")) {
    return "ecom";
  }
  return "service";
}

export function getAuthTokenForRequest(auth, requestUrl) {
  if (!auth) return null;
  const panelMode = normalizePanelMode(auth.panelMode);
  if (panelMode !== "both") {
    return auth.token || null;
  }

  const apiMode = resolveApiModeFromRequestUrl(requestUrl);
  const accountToken = auth.accounts?.[apiMode]?.token;
  return accountToken || auth.token || null;
}

export function getRefreshTokenForApiMode(auth, apiMode) {
  if (!auth) return null;
  return auth.accounts?.[apiMode]?.refreshToken || auth.refreshToken || null;
}

export function panelModeLabel(panelMode) {
  if (panelMode === "ecom") return "E-commerce";
  if (panelMode === "both") return "Service & Shop";
  return "Service";
}
