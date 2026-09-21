import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ADMIN_LOGIN_PATH } from "../constants/authRoutes.js";
import { navItems } from "../data/navItems.js";
import { selectAppDisplayName, selectPanelLogoUrl } from "../store/appConfigSelectors.js";
import { mediaUrl } from "../media.js";
import { logout } from "../store/authSlice.js";
import { confirmLogout } from "../utils/confirmLogout.js";
import { NavIcon } from "./NavIcon.jsx";

function pathInGroup(pathname, groupId) {
  if (groupId === "ecom") {
    return /\/admin\/(vendors|delivery-cod|delivery|orders|products|attribute-sets|attributes)(\/|$)/.test(pathname);
  }
  if (groupId === "venue") {
    return /\/admin\/(venue-vendors|venues|amenities)(\/|$)/.test(pathname);
  }
  if (groupId === "recharge") {
    return /\/admin\/(mobile-recharge|gas-recharge|fastag-recharge)(\/|$)/.test(pathname);
  }
  return false;
}

function childPathActive(pathname, segment) {
  const base = `/admin/${segment}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function Sidebar({ id = "admin-sidebar", onNavigate, drawerOpen, desktopCollapsed }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const brandLogoUrl = useSelector(selectPanelLogoUrl);
  const appDisplayName = useSelector(selectAppDisplayName);
  const logoSrc = mediaUrl(brandLogoUrl);

  const initialOpen = useMemo(
    () => ({
      ecom: pathInGroup(location.pathname, "ecom"),
      venue: pathInGroup(location.pathname, "venue"),
      recharge: pathInGroup(location.pathname, "recharge"),
    }),
    [location.pathname]
  );

  const [openGroups, setOpenGroups] = useState(() => ({
    ecom: true,
    venue: true,
    recharge: true,
  }));
  const [activeFlyout, setActiveFlyout] = useState(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const sidebarRef = useRef(null);
  const navRef = useRef(null);
  const groupBtnRefs = useRef({});

  useEffect(() => {
    setOpenGroups((prev) => ({
      ecom: prev.ecom || initialOpen.ecom,
      venue: prev.venue || initialOpen.venue,
      recharge: prev.recharge || initialOpen.recharge,
    }));
  }, [initialOpen.ecom, initialOpen.venue, initialOpen.recharge]);

  const closeCollapsedFlyouts = () => {
    setActiveFlyout(null);
    setFlyoutTop(0);
  };

  const syncFlyoutPosition = (groupId) => {
    const btn = groupBtnRefs.current[groupId];
    if (!btn) return;
    setFlyoutTop(btn.getBoundingClientRect().top);
  };

  useEffect(() => {
    if (desktopCollapsed) {
      closeCollapsedFlyouts();
    }
  }, [desktopCollapsed]);

  useEffect(() => {
    if (desktopCollapsed) {
      closeCollapsedFlyouts();
    }
  }, [location.pathname, desktopCollapsed]);

  useEffect(() => {
    if (!desktopCollapsed || !activeFlyout) return undefined;

    const updateFlyoutPosition = () => syncFlyoutPosition(activeFlyout);
    updateFlyoutPosition();

    const nav = navRef.current;
    nav?.addEventListener("scroll", updateFlyoutPosition, { passive: true });
    window.addEventListener("resize", updateFlyoutPosition);
    return () => {
      nav?.removeEventListener("scroll", updateFlyoutPosition);
      window.removeEventListener("resize", updateFlyoutPosition);
    };
  }, [desktopCollapsed, activeFlyout]);

  useEffect(() => {
    if (!desktopCollapsed || !activeFlyout) return undefined;

    const onPointerDown = (event) => {
      if (sidebarRef.current?.contains(event.target)) return;
      closeCollapsedFlyouts();
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [desktopCollapsed, activeFlyout]);

  const toggleGroup = (groupId, event) => {
    if (desktopCollapsed) {
      const next = activeFlyout === groupId ? null : groupId;
      setActiveFlyout(next);
      if (next) {
        const btn = event?.currentTarget;
        if (btn) {
          groupBtnRefs.current[groupId] = btn;
          setFlyoutTop(btn.getBoundingClientRect().top);
        }
      } else {
        setFlyoutTop(0);
      }
      return;
    }
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isCollapsedGroupOpen = (groupId) => activeFlyout === groupId;

  const handleLogout = async () => {
    const ok = await confirmLogout();
    if (!ok) return;
    dispatch(logout());
    navigate(ADMIN_LOGIN_PATH, { replace: true });
    onNavigate?.();
  };

  return (
    <aside
      ref={sidebarRef}
      id={id}
      className={`admin-sidebar${drawerOpen ? " admin-sidebar--open" : ""}${
        desktopCollapsed ? " admin-sidebar--collapsed" : ""
      }`}
      aria-label="Main navigation"
    >
      <div className="admin-sidebar__brand">
        <span className="admin-sidebar__logo" aria-hidden="true">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="admin-sidebar__logo-img" width={36} height={36} />
          ) : (
            <svg viewBox="0 0 32 32" width="28" height="28">
              <defs>
                <linearGradient id="brandGrad" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ffd54a" />
                  <stop offset="100%" stopColor="#ff8a00" />
                </linearGradient>
              </defs>
              <rect x="4" y="6" width="18" height="20" rx="3" fill="url(#brandGrad)" />
              <path d="M22 10h6v16a2 2 0 0 1-2 2h-4V10z" fill="#1a1a1a" opacity="0.85" />
            </svg>
          )}
        </span>
        <div className="admin-sidebar__brand-text">
          <div className="admin-sidebar__title" title={appDisplayName || "OhoE"}>
            {appDisplayName || "OhoE"}
          </div>
          <div className="admin-sidebar__subtitle">Admin</div>
        </div>
      </div>

      <nav className="admin-sidebar__nav" ref={navRef}>
        {navItems.map((item) =>
          Array.isArray(item.children) && item.id ? (
            <div
              key={item.id}
              className={`admin-sidebar__group${
                desktopCollapsed && isCollapsedGroupOpen(item.id) ? " admin-sidebar__group--flyout-open" : ""
              }`}
            >
              <button
                type="button"
                ref={(node) => {
                  if (node) groupBtnRefs.current[item.id] = node;
                }}
                className={`admin-sidebar__link admin-sidebar__group-btn${
                  item.children.some((c) => childPathActive(location.pathname, c.to))
                    ? " admin-sidebar__group-btn--ancestor"
                    : ""
                }${desktopCollapsed && isCollapsedGroupOpen(item.id) ? " admin-sidebar__link--active" : ""}`}
                onClick={(event) => toggleGroup(item.id, event)}
                title={item.label}
                aria-expanded={desktopCollapsed ? isCollapsedGroupOpen(item.id) : Boolean(openGroups[item.id])}
              >                <NavIcon name={item.icon} />
                <span className="admin-sidebar__link-text">{item.label}</span>
                <span
                  className={`admin-sidebar__chevron${
                    (desktopCollapsed ? isCollapsedGroupOpen(item.id) : openGroups[item.id]) ? " is-open" : ""
                  }`}                  aria-hidden
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
              {(desktopCollapsed ? isCollapsedGroupOpen(item.id) : openGroups[item.id]) ? (
                <div
                  className="admin-sidebar__children"
                  style={desktopCollapsed ? { top: flyoutTop } : undefined}
                >                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      title={child.label}
                      className={({ isActive }) =>
                        `admin-sidebar__link admin-sidebar__link--child${
                          isActive ? " admin-sidebar__link--active" : ""
                        }`
                      }
                      onClick={() => {
                        onNavigate?.();
                        if (desktopCollapsed) {
                          closeCollapsedFlyouts();
                        }
                      }}
                    >
                      <NavIcon name={child.icon} />
                      <span className="admin-sidebar__link-text">{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                `admin-sidebar__link${isActive ? " admin-sidebar__link--active" : ""}`
              }
              onClick={() => {
                onNavigate?.();
                if (desktopCollapsed) closeCollapsedFlyouts();
              }}
            >
              <NavIcon name={item.icon} />
              <span className="admin-sidebar__link-text">{item.label}</span>
            </NavLink>
          )
        )}
      </nav>

      <div className="admin-sidebar__footer">
        <button type="button" className="admin-sidebar__logout" title="Logout" onClick={handleLogout}>
          <NavIcon name="logout" />
          <span className="admin-sidebar__logout-text">Logout</span>
        </button>
      </div>
    </aside>
  );
}
