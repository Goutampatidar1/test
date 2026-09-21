import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { mediaUrl } from "../media.js";
import { VENDOR_LOGIN_PATH } from "../constants/authRoutes.js";
import { logout } from "../store/authSlice.js";
import { confirmLogout } from "../utils/confirmLogout.js";
import { HeaderNotifications } from "./HeaderNotifications.jsx";
import { NavIcon } from "./NavIcon.jsx";
import { PanelModeToggle } from "./PanelModeToggle.jsx";

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
  const user = useSelector((s) => s.auth.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  const avatarSrc = mediaUrl(user?.profileImage);
  const initial = (user?.name || user?.email || "V").charAt(0).toUpperCase();

  const showCloseIcon = !isDesktop && mobileNavOpen;
  const navAriaLabel = isDesktop
    ? desktopSidebarCollapsed
      ? "Expand sidebar"
      : "Collapse sidebar"
    : mobileNavOpen
      ? "Close menu"
      : "Open menu";

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    if (!(await confirmLogout())) return;
    dispatch(logout());
    navigate(VENDOR_LOGIN_PATH, { replace: true });
  };

  return (
    <header className="admin-header">
      <button
        type="button"
        className="admin-header__menu-btn"
        onClick={onMenuClick}
        aria-label={navAriaLabel}
        aria-expanded={isDesktop ? !desktopSidebarCollapsed : mobileNavOpen}
        aria-controls="vendor-sidebar"
      >
        <NavIcon name={showCloseIcon ? "close" : "menu"} />
      </button>

      <div className="admin-header__brand admin-header__brand--vendor">
        <div className="admin-header__title-group">
          <h1 className="admin-header__title">{title}</h1>
        </div>
      </div>

      <div className="admin-header__spacer" />

      <div className="admin-header__actions">
        <PanelModeToggle compact />
        <HeaderNotifications />

        <div className="admin-header__profile" ref={wrapRef}>
          <button
            type="button"
            className="admin-header__avatar-btn"
            aria-label="Vendor menu"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="admin-header__avatar-img" width={36} height={36} />
            ) : (
              <span className="admin-header__avatar-initial">{initial}</span>
            )}
          </button>
          {menuOpen ? (
            <div className="admin-header__dropdown" role="menu">
              <Link to="/vendor/profile" className="admin-header__dropdown-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                Profile
              </Link>
              <div className="admin-header__dropdown-sep" role="separator" />
              <button type="button" className="admin-header__dropdown-item" role="menuitem" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
