import { ADMIN_LOGIN_PATH } from "../constants/authRoutes.js";
import { logout } from "../store/authSlice.js";

let storeRef = null;
let expiring = false;

export function configureAuthSession(store) {
  storeRef = store;
}

export function isPublicAuthRequestUrl(url = "") {
  const path = String(url);
  return path.includes("/admin/auth/login") || path.includes("/admin/auth/refresh");
}

export function isProtectedAppPath(pathname = "") {
  const path = String(pathname);
  return path.startsWith("/admin") && path !== ADMIN_LOGIN_PATH;
}

export function getLoginPath() {
  return ADMIN_LOGIN_PATH;
}

export function selectIsAuthenticated(state) {
  return Boolean(state?.auth?.adminToken);
}

/** Clear Redux + storage and send the user to the login screen. */
export function expireSession() {
  if (!storeRef || expiring) return;

  const wasAuthenticated = selectIsAuthenticated(storeRef.getState());
  if (!wasAuthenticated) return;

  expiring = true;
  storeRef.dispatch(logout());

  const currentPath = window.location.pathname;
  if (currentPath !== ADMIN_LOGIN_PATH) {
    window.location.replace(ADMIN_LOGIN_PATH);
    return;
  }

  expiring = false;
}
