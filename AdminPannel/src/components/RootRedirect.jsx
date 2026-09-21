import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { ADMIN_LOGIN_PATH } from "../constants/authRoutes.js";

export function RootRedirect() {
  const adminToken = useSelector((s) => s.auth.adminToken);
  return <Navigate to={adminToken ? "/admin/dashboard" : ADMIN_LOGIN_PATH} replace />;
}
