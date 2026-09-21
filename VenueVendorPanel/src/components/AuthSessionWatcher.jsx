import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { getLoginPath, isProtectedAppPath, selectIsAuthenticated } from "../utils/authSession.js";

export function AuthSessionWatcher() {
  const authenticated = useSelector(selectIsAuthenticated);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const loginPath = getLoginPath();

  useEffect(() => {
    if (authenticated) return;
    if (!isProtectedAppPath(pathname)) return;
    navigate(loginPath, { replace: true });
  }, [authenticated, loginPath, navigate, pathname]);

  return null;
}
