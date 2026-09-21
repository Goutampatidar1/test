import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { selectPanelMode } from "../store/authSlice.js";
import {
  vendorEcomListNotifications,
  vendorEcomMarkAllNotificationsRead,
  vendorEcomMarkNotificationRead,
  vendorEcomNotificationLink,
} from "../api/vendorEcomNotifications.js";
import {
  venueVendorListNotifications,
  venueVendorMarkAllNotificationsRead,
  venueVendorMarkNotificationRead,
  venueVendorNotificationLink,
} from "../api/venueVendorNotifications.js";
import { NavIcon } from "./NavIcon.jsx";

function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function HeaderNotifications() {
  const navigate = useNavigate();
  const panelMode = useSelector(selectPanelMode);
  const isEcom = panelMode === "ecom";
  const isBoth = panelMode === "both";
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadInbox = useCallback(async () => {
    try {
      if (isBoth) {
        const [serviceResult, ecomResult] = await Promise.all([
          venueVendorListNotifications({ limit: 20 }),
          vendorEcomListNotifications({ limit: 20 }),
        ]);
        const merged = [...(serviceResult?.notifications ?? []), ...(ecomResult?.notifications ?? [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setItems(merged.slice(0, 20));
        setUnreadCount((Number(serviceResult?.unreadCount) || 0) + (Number(ecomResult?.unreadCount) || 0));
        return;
      }

      const result = isEcom
        ? await vendorEcomListNotifications({ limit: 20 })
        : await venueVendorListNotifications({ limit: 20 });
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch {
      setItems([]);
      setUnreadCount(0);
    }
  }, [isBoth, isEcom]);

  useEffect(() => {
    setOpen(false);
    loadInbox();
    const timer = setInterval(loadInbox, 30000);
    return () => clearInterval(timer);
  }, [loadInbox]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await loadInbox();
      setLoading(false);
    }
  };

  const onOpenItem = async (item) => {
    const id = item?._id;
    const link = isBoth
      ? vendorEcomNotificationLink(item) || venueVendorNotificationLink(item)
      : isEcom
        ? vendorEcomNotificationLink(item)
        : venueVendorNotificationLink(item);
    if (id && !item.isRead) {
      try {
      if (isBoth) {
        const ecomLink = vendorEcomNotificationLink(item);
        if (ecomLink) {
          await vendorEcomMarkNotificationRead(id);
        } else {
          await venueVendorMarkNotificationRead(id);
        }
      } else if (isEcom) {
        await vendorEcomMarkNotificationRead(id);
      } else {
        await venueVendorMarkNotificationRead(id);
      }
        setItems((prev) => prev.map((row) => (row._id === id ? { ...row, isRead: true } : row)));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        /* navigation still proceeds */
      }
    }
    setOpen(false);
    if (link) navigate(link);
  };

  const onMarkAllRead = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (isBoth) {
        await Promise.all([venueVendorMarkAllNotificationsRead(), vendorEcomMarkAllNotificationsRead()]);
      } else if (isEcom) {
        await vendorEcomMarkAllNotificationsRead();
      } else {
        await venueVendorMarkAllNotificationsRead();
      }
      setItems((prev) => prev.map((row) => ({ ...row, isRead: true })));
      setUnreadCount(0);
    } catch {
      /* keep list as-is */
    }
  };

  return (
    <div className="admin-header__notify" ref={wrapRef}>
      <button
        type="button"
        className="admin-header__notify-btn admin-header__bell-btn"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={onToggle}
      >
        <NavIcon name="bell" />
        {unreadCount > 0 ? (
          <span className="admin-header__notify-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="admin-header__notify-panel" role="menu">
          <div className="admin-header__notify-head">
            <strong>Notifications</strong>
            {unreadCount > 0 ? (
              <button type="button" className="admin-header__notify-mark" onClick={onMarkAllRead}>
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="admin-header__notify-list">
            {loading && items.length === 0 ? (
              <p className="admin-header__notify-empty">Loading…</p>
            ) : items.length === 0 ? (
              <p className="admin-header__notify-empty">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  className={`admin-header__notify-item${item.isRead ? "" : " is-unread"}`}
                  onClick={() => onOpenItem(item)}
                >
                  <span className="admin-header__notify-title">{item.title || "Notification"}</span>
                  <span className="admin-header__notify-msg">{item.message}</span>
                  <span className="admin-header__notify-time">{formatRelativeTime(item.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
