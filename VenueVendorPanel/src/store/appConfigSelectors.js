import { mediaUrl } from "../media.js";

export function selectAppConfigData(state) {
  return state.appConfig?.data ?? null;
}

/** Panel sidebar/header — same priority as admin: admin logo, then storefront logo. */
export function selectPanelLogoPath(state) {
  const d = selectAppConfigData(state);
  if (!d) return "";
  return d.admin_logo || d.user_logo || "";
}

export function selectAppDisplayName(state) {
  const name = selectAppConfigData(state)?.app_name?.trim();
  return name || "Oho Ebazar";
}

/** Login page branding — admin logo, then storefront logo. */
export function selectLoginBrandLogoUrl(state) {
  return mediaUrl(selectPanelLogoPath(state));
}
