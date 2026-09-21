import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { vendorPanelGetMe } from "../api/vendorPanelAuth.js";
import { Footer } from "../components/Footer.jsx";
import { Header } from "../components/Header.jsx";
import { Sidebar } from "../components/Sidebar.jsx";
import { flattenNavLinks, getNavItemsForMode } from "../data/navItems.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { selectAppDisplayName, selectPanelLogoPath } from "../store/appConfigSelectors.js";
import { logout, selectPanelMode, setUser } from "../store/authSlice.js";
import { panelModeLabel } from "../utils/panelMode.js";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import { PendingApprovalBanner } from "../pages/PendingApprovalBanner.jsx";
import { VendorAnnouncementTicker } from "../components/VendorAnnouncementTicker.jsx";

const SERVICE_PREFIXES = ["/vendor/dashboard", "/vendor/venues", "/vendor/reels", "/vendor/bookings", "/vendor/promotions", "/vendor/profile", "/vendor/pages"];
const ECOM_PREFIXES = [
  "/vendor/dashboard",
  "/vendor/reels",
  "/vendor/products",
  "/vendor/orders",
  "/vendor/promotions",
  "/vendor/profile",
  "/vendor/pages",
];

function titleFromPath(pathname, navItems) {
  const parts = pathname.replace(/\/vendor\/?/, "").split("/").filter(Boolean);
  const segment = parts[0] || "dashboard";
  if (segment === "venues") {
    if (parts[1] === "new") return "Add Service";
    if (parts[2] === "edit") return "Edit Service";
    if (parts[1]) return "View Service";
    return "Services";
  }
  if (segment === "products") {
    if (parts[1] === "new") return "Add Product";
    return "Products";
  }
  if (segment === "orders") return "Orders";
  if (segment === "pages" && parts[1]) {
    return "Page";
  }
  const found = flattenNavLinks(navItems).find((n) => n.to === segment);
  return found ? found.label : "Dashboard";
}

function isAllowedPath(pathname, panelMode) {
  const prefixes =
    panelMode === "both"
      ? [...new Set([...SERVICE_PREFIXES, ...ECOM_PREFIXES])]
      : panelMode === "ecom"
        ? ECOM_PREFIXES
        : SERVICE_PREFIXES;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function VendorLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth.token);
  const user = useSelector((s) => s.auth.user);
  const panelMode = useSelector(selectPanelMode);
  const accounts = useSelector((s) => s.auth.accounts);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const brandLogo = useSelector(selectPanelLogoPath);
  const appName = useSelector(selectAppDisplayName);

  const navItems = useMemo(() => getNavItemsForMode(panelMode), [panelMode]);
  const pageTitle = useMemo(() => titleFromPath(pathname, navItems), [pathname, navItems]);
  const usesPageShell = /^\/vendor\/(dashboard|venues|bookings|products|orders)/.test(pathname);
  const isEcomProductEditor = /^\/vendor\/products\/new/.test(pathname);
  const serviceApproval = accounts?.service?.approvalStatus ?? accounts?.service?.user?.approvalStatus;
  const activeApproval =
    panelMode === "ecom"
      ? user?.approvalStatus ?? accounts?.ecom?.approvalStatus
      : user?.approvalStatus ?? serviceApproval;
  const isPending =
    (panelMode === "service" || panelMode === "both") && serviceApproval === "pending";
  const panelLabel = panelMode === "both" ? "Service & Shop Vendor" : `${panelModeLabel(panelMode)} Vendor`;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const refreshProfile = async () => {
      try {
        const refreshMode = panelMode === "both" ? "service" : panelMode;
        const data = await vendorPanelGetMe(token, refreshMode);
        if (!cancelled && data?.user) dispatch(setUser(data.user));
      } catch (e) {
        if (e?.status === 401) dispatch(logout());
      }
    };

    refreshProfile();
    window.addEventListener("focus", refreshProfile);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshProfile);
    };
  }, [dispatch, token, panelMode]);

  useEffect(() => {
    if (!token || isAllowedPath(pathname, panelMode)) return;
    navigate("/vendor/dashboard", { replace: true });
  }, [navigate, panelMode, pathname, token]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.title = appName ? `${appName} — ${panelLabel}` : `Oho Ebazar — ${panelLabel}`;
  }, [appName, panelLabel]);

  if (!token) {
    return <Navigate to={VENDOR_LOGIN_PATH} replace />;
  }

  const toggleSidebar = () => {
    if (isDesktop) {
      setSidebarCollapsed((c) => !c);
      setSidebarOpen(false);
    } else {
      setSidebarOpen((v) => !v);
    }
  };

  return (
    <div
      className={`vendor-shell admin-shell${
        sidebarOpen ? " vendor-shell--nav-open admin-shell--nav-open" : ""
      }${sidebarCollapsed ? " vendor-shell--sidebar-collapsed admin-shell--sidebar-collapsed" : ""}`}
    >
      <button
        type="button"
        className="admin-backdrop vendor-backdrop"
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        id="vendor-sidebar"
        drawerOpen={sidebarOpen}
        desktopCollapsed={sidebarCollapsed}
        onNavigate={() => setSidebarOpen(false)}
        brandLogo={brandLogo}
        appName={appName}
        navItems={navItems}
        panelMode={panelMode}
      />
      <div className="admin-main vendor-main">
        <Header
          title={pageTitle}
          onMenuClick={toggleSidebar}
          isDesktop={isDesktop}
          mobileNavOpen={sidebarOpen}
          desktopSidebarCollapsed={sidebarCollapsed}
        />
        {isPending ? <PendingApprovalBanner /> : null}
        <VendorAnnouncementTicker />
        <main
          className={`admin-content vendor-content${
            usesPageShell || isEcomProductEditor ? " vendor-content--page" : ""
          }`}
        >
          <Outlet />
        </main>
        {!usesPageShell ? <Footer /> : null}
      </div>
    </div>
  );
}
