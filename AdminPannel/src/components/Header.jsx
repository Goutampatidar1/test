import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ADMIN_LOGIN_PATH } from "../constants/authRoutes.js";
import { selectAppDisplayName, selectPanelLogoUrl } from "../store/appConfigSelectors.js";
import { mediaUrl } from "../media.js";
import { logout } from "../store/authSlice.js";
import { confirmLogout } from "../utils/confirmLogout.js";
import { HeaderNotifications } from "./HeaderNotifications.jsx";
import { NavIcon } from "./NavIcon.jsx";

export function Header({
  title,
  onMenuClick,
  isDesktop,
  mobileNavOpen,
  desktopSidebarCollapsed,
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const admin = useSelector((s) => s.auth.admin);
  const brandLogoUrl = useSelector(selectPanelLogoUrl);
  const appDisplayName = useSelector(selectAppDisplayName);
  const brandLogoSrc = mediaUrl(brandLogoUrl);

  const [menuOpenState, setMenuOpenState] = useState(false);
  const wrapRef = useRef(null);

  const avatarSrc = mediaUrl(admin?.profileImage);
  const initial = (admin?.name || admin?.email || "A").charAt(0).toUpperCase();

  const showCloseIcon = !isDesktop && mobileNavOpen;
  const navAriaExpanded = isDesktop ? !desktopSidebarCollapsed : mobileNavOpen;
  const navAriaLabel = isDesktop
    ? desktopSidebarCollapsed
      ? "Expand sidebar"
      : "Collapse sidebar"
    : mobileNavOpen
      ? "Close menu"
      : "Open menu";

  useEffect(() => {
    setMenuOpenState(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpenState) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpenState(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpenState(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpenState]);

  const closeMenu = () => setMenuOpenState(false);

  const handleLogout = async () => {
    const ok = await confirmLogout();
    if (!ok) return;
    dispatch(logout());
    closeMenu();
    navigate(ADMIN_LOGIN_PATH, { replace: true });
  };

  return (
    <header className="admin-header">
      <button
        type="button"
        className="admin-header__menu-btn"
        onClick={onMenuClick}
        aria-label={navAriaLabel}
        aria-expanded={navAriaExpanded}
        aria-controls="admin-sidebar"
      >
        <NavIcon name={showCloseIcon ? "close" : "menu"} />
      </button>

      <div className="admin-header__brand">
        {brandLogoSrc ? <img src={brandLogoSrc} alt="" className="admin-header__brand-logo" /> : null}
        <div className="admin-header__title-group">
          <p className="admin-header__app-line" title={appDisplayName || "OhoE"}>
            {appDisplayName || "OhoE"}
          </p>
        </div>
      </div>
      <div className="admin-header__spacer" />
      <HeaderNotifications />

      <div className="admin-header__profile" ref={wrapRef}>
        <button
          type="button"
          className="admin-header__avatar-btn"
          aria-label="Admin menu"
          aria-haspopup="true"
          aria-expanded={menuOpenState}
          onClick={() => setMenuOpenState((v) => !v)}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="admin-header__avatar-img" width={36} height={36} />
          ) : (
            <span className="admin-header__avatar-initial">{initial}</span>
          )}
        </button>

        {menuOpenState ? (
          <div className="admin-header__dropdown" role="menu">
            <Link to="/admin/profile" className="admin-header__dropdown-item" role="menuitem" onClick={closeMenu}>
              <span className="admin-header__dropdown-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              Profile
            </Link>
            <Link to="/admin/settings" className="admin-header__dropdown-item" role="menuitem" onClick={closeMenu}>
              <span className="admin-header__dropdown-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </span>
              Settings
            </Link>
            <div className="admin-header__dropdown-sep" role="separator" />
            <button type="button" className="admin-header__dropdown-item" role="menuitem" onClick={handleLogout}>
              <span className="admin-header__dropdown-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
              </span>
              Logout
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
