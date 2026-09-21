import { getLoginPath, isVendorProtectedPath, VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import { logout } from "../store/authSlice.js";

let storeRef = null;
let expiring = false;

export function configureAuthSession(store) {
  storeRef = store;
}

export function isPublicAuthRequestUrl(url = "") {
  const path = String(url);
  return (
    path.includes("/vendor-panel/auth/") ||
    path.includes("/venue-vendor/auth/login") ||
    path.includes("/venue-vendor/auth/otp/") ||
    path.includes("/venue-vendor/auth/register") ||
    path.includes("/venue-vendor/auth/refresh") ||
    path.includes("/venue-vendor/auth/forgot-password") ||
    path.includes("/venue-vendor/auth/reset-password") ||
    path.includes("/vendor/auth/refresh")
  );
}

export function isProtectedAppPath(pathname = "") {
  return isVendorProtectedPath(pathname);
}

export { getLoginPath };

export function selectIsAuthenticated(state) {
  return Boolean(state?.auth?.token);
}

/** Clear Redux + storage and send the user to the login screen. */
export function expireSession() {
  if (!storeRef || expiring) return;

  const wasAuthenticated = selectIsAuthenticated(storeRef.getState());
  if (!wasAuthenticated) return;

  expiring = true;
  storeRef.dispatch(logout());

  const currentPath = window.location.pathname;
  if (currentPath !== VENDOR_LOGIN_PATH) {
    window.location.replace(VENDOR_LOGIN_PATH);
    return;
  }

  expiring = false;
}
