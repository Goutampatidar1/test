/** Venue vendor panel routes — all live under /vendor to avoid clashing with admin (/admin/login). */
export const VENDOR_BASE = "/vendor";
export const VENDOR_LOGIN_PATH = "/vendor/login";
export const VENDOR_REGISTER_PATH = "/vendor/register";
export const VENDOR_FORGOT_PASSWORD_PATH = "/vendor/forgot-password";
export const VENDOR_RESET_PASSWORD_PATH = "/vendor/reset-password";

export const VENDOR_PUBLIC_PATHS = [
  VENDOR_LOGIN_PATH,
  VENDOR_REGISTER_PATH,
  VENDOR_FORGOT_PASSWORD_PATH,
  VENDOR_RESET_PASSWORD_PATH,
];

export function isVendorProtectedPath(pathname = "") {
  const path = String(pathname);
  if (!path.startsWith(VENDOR_BASE)) return false;
  return !VENDOR_PUBLIC_PATHS.includes(path);
}

export function getLoginPath() {
  return VENDOR_LOGIN_PATH;
}
