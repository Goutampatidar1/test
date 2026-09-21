// import { miscUploadSrc } from "../api/adminMisc.js";
import { mediaUrl } from "../media.js";

const DEFAULT_APP_NAME = "Oho Ebazar";

/** Raw app config document from the API (public or admin). */
export function selectAppConfigData(state) {
  return state.appConfig?.data ?? null;
}

export function selectAppConfigLoading(state) {
  return !!state.appConfig?.loading;
}

/**
 * Prefer admin logo in the panel; fall back to storefront user logo.
 */
export function selectPanelLogoUrl(state) {
  const d = selectAppConfigData(state);
  if (!d) return "";
  const path = d.admin_logo || d.user_logo || "";
  return mediaUrl(path);
}

export function selectAppDisplayName(state) {
  const name = selectAppConfigData(state)?.app_name?.trim();
  return name || DEFAULT_APP_NAME;
}

export function selectLoginBrandLogoUrl(state) {
  const d = selectAppConfigData(state);
  if (!d) return "";
  const path = d.user_logo || d.admin_logo || "";
  return mediaUrl(path);
}

export function selectAppFooterText(state) {
  const text = selectAppConfigData(state)?.app_footer_text;
  return typeof text === "string" ? text.trim() : "";
}
