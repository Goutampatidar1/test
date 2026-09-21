import { Navigate, useLocation } from "react-router-dom";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";

/**
 * Unknown routes in the venue vendor SPA.
 * Do not redirect /admin/* — that belongs to the admin panel when both apps share a host.
 */
export function VendorFallbackRedirect() {
  const { pathname, search, hash } = useLocation();

  if (pathname.startsWith("/admin")) {
    window.location.replace(`${pathname}${search}${hash}`);
    return null;
  }

  return <Navigate to={VENDOR_LOGIN_PATH} replace />;
}
