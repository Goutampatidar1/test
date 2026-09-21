import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { listVenueVendorStaticPages } from "../api/staticPages.js";
import { NavIcon } from "./NavIcon.jsx";
import { BrandLogoMark } from "./BrandLogoMark.jsx";
import { pagesNavGroup, serviceNavItems } from "../data/navItems.js";
import { panelModeLabel } from "../utils/panelMode.js";
import { selectHasBothCapabilities } from "../store/authSlice.js";
import { PanelModeToggle } from "./PanelModeToggle.jsx";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import { logout } from "../store/authSlice.js";
import { confirmLogout } from "../utils/confirmLogout.js";

export function Sidebar({
  id = "vendor-sidebar",
  onNavigate,
  drawerOpen,
  desktopCollapsed,
  brandLogo,
  appName,
  navItems = serviceNavItems,
  panelMode = "service",
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const hasBothModes = useSelector(selectHasBothCapabilities);
  const { pathname } = useLocation();
  const isPagesActive = pathname.startsWith("/vendor/pages/");
  const [pagesOpen, setPagesOpen] = useState(true);
  const [staticPages, setStaticPages] = useState([]);
  const [pagesLoading, setPagesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPagesLoading(true);
      try {
        const pages = await listVenueVendorStaticPages();
        if (!cancelled) {
          setStaticPages(pages ?? []);
          if ((pages ?? []).length > 0) setPagesOpen(true);
        }
      } catch {
        if (!cancelled) setStaticPages([]);
      } finally {
        if (!cancelled) setPagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isPagesActive) setPagesOpen(true);
  }, [isPagesActive]);

  const handleLogout = async () => {
    if (!(await confirmLogout())) return;
    dispatch(logout());
    navigate(VENDOR_LOGIN_PATH, { replace: true });
  };

  const handlePagesToggle = () => {
    setPagesOpen((open) => {
      if (!open) return true;
      if (isPagesActive) return true;
      return false;
    });
  };

  const showPagesMenu = pagesOpen;

  return (
    <aside
      id={id}
      className={`vendor-sidebar${drawerOpen ? " vendor-sidebar--open" : ""}${
        desktopCollapsed ? " vendor-sidebar--collapsed" : ""
      }`}
      aria-label="Main navigation"
    >
      <div className="vendor-sidebar__brand">
        <span className="vendor-sidebar__logo" aria-hidden="true">
          <BrandLogoMark
            logoPath={brandLogo}
            size={28}
            imgClassName="vendor-sidebar__logo-img"
            fill
          />
        </span>
        {!desktopCollapsed ? (
          <div className="vendor-sidebar__brand-text">
            <div className="vendor-sidebar__title">{appName || "Oho Ebazar"}</div>
            <div className="vendor-sidebar__subtitle">{panelModeLabel(panelMode)}</div>
          </div>
        ) : null}
      </div>

      <nav className="vendor-sidebar__nav">
        {hasBothModes ? (
          <div className="vendor-sidebar__mode-toggle">
            <PanelModeToggle />
          </div>
        ) : null}
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={`/vendor/${item.to}`}
            end={item.to === "dashboard"}
            className={({ isActive }) => `vendor-sidebar__link${isActive ? " vendor-sidebar__link--active" : ""}`}
            onClick={onNavigate}
          >
            <NavIcon name={item.icon} />
            <span className="vendor-sidebar__link-text">{item.label}</span>
          </NavLink>
        ))}

        <div className="vendor-sidebar__group">
          <button
            type="button"
            className={`vendor-sidebar__link vendor-sidebar__link--group${
              pagesOpen ? " is-open" : ""
            }${isPagesActive ? " vendor-sidebar__link--ancestor" : ""}`}
            onClick={handlePagesToggle}
            aria-expanded={pagesOpen}
            title={pagesNavGroup.label}
          >
            <NavIcon name={pagesNavGroup.icon} />
            <span className="vendor-sidebar__link-text">{pagesNavGroup.label}</span>
            <span className={`vendor-sidebar__chevron-wrap${pagesOpen ? " is-open" : ""}`} aria-hidden="true">
              <NavIcon name="chevron" className="vendor-sidebar__chevron" />
            </span>
          </button>

          {showPagesMenu ? (
            <div
              className={`vendor-sidebar__subnav${
                desktopCollapsed ? " vendor-sidebar__subnav--flyout" : ""
              }`}
            >
              {pagesLoading ? (
                <p className="vendor-sidebar__subempty">Loading pages…</p>
              ) : staticPages.length === 0 ? (
                <p className="vendor-sidebar__subempty">No pages available</p>
              ) : (
                staticPages.map((page) => (
                  <NavLink
                    key={page.slug}
                    to={`/vendor/pages/${encodeURIComponent(page.slug)}`}
                    className={({ isActive }) =>
                      `vendor-sidebar__sublink${isActive ? " vendor-sidebar__sublink--active" : ""}`
                    }
                    onClick={onNavigate}
                    title={page.title}
                  >
                    {page.title}
                  </NavLink>
                ))
              )}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="vendor-sidebar__footer">
        <button type="button" className="vendor-sidebar__logout" onClick={handleLogout}>
          <NavIcon name="logout" />
          <span className="vendor-sidebar__logout-text">Logout</span>
        </button>
      </div>
    </aside>
  );
}
