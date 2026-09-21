import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Route, Routes, Navigate } from "react-router-dom";
import { RootRedirect } from "./components/RootRedirect.jsx";
import { AuthSessionWatcher } from "./components/AuthSessionWatcher.jsx";
import { ADMIN_LOGIN_PATH } from "./constants/authRoutes.js";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { adminRouteTree } from "./routes/adminRoutes.jsx";
import { selectAppConfigData } from "./store/appConfigSelectors.js";
import { clearAppConfig, fetchAppConfig, fetchPublicAppConfig } from "./store/appConfigSlice.js";
import { mediaUrl, mediaUrlOnNodePort } from "./media.js";
import { applyAppConfigFavicon } from "./utils/documentFavicon.js";

function AppConfigSync() {
  const dispatch = useDispatch();
  const adminToken = useSelector((s) => s.auth.adminToken);
  const config = useSelector(selectAppConfigData);

  useEffect(() => {
    if (adminToken) {
      dispatch(fetchAppConfig(adminToken));
      return;
    }
    dispatch(clearAppConfig());
    dispatch(fetchPublicAppConfig());
  }, [dispatch, adminToken]);

  useEffect(() => {
    applyAppConfigFavicon(config?.favicon, {
      cacheKey: config?.updatedAt || config?.favicon || "",
      mediaUrl,
      mediaUrlOnNodePort,
      baseUrl: import.meta.env.BASE_URL || "/",
    });
  }, [config?.favicon, config?.updatedAt]);

  return null;
}

export default function App() {
  return (
    <>
      <AppConfigSync />
      <AuthSessionWatcher />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Navigate to={ADMIN_LOGIN_PATH} replace />} />
        <Route path={ADMIN_LOGIN_PATH} element={<LoginPage />} />
        {adminRouteTree}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
