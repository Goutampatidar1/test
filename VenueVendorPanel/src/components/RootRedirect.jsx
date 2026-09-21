import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";

export function RootRedirect() {
  const token = useSelector((s) => s.auth.token);
  return <Navigate to={token ? "/vendor/dashboard" : VENDOR_LOGIN_PATH} replace />;
}
