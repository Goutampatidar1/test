import api, { normalizeApiError } from "../api.js";

export async function adminListInboxNotifications({ page = 1, limit = 20, unreadOnly } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (unreadOnly) q.set("unreadOnly", "true");
  try {
    const { data } = await api.get(`/admin/inbox-notifications?${q}`);
    return {
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      unreadCount: Number(data.unreadCount) || 0,
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminMarkInboxNotificationRead(id) {
  try {
    const { data } = await api.patch(`/admin/inbox-notifications/${encodeURIComponent(id)}/read`);
    return data.notification;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminMarkAllInboxNotificationsRead() {
  try {
    await api.patch("/admin/inbox-notifications/read-all");
  } catch (error) {
    normalizeApiError(error);
  }
}

export function inboxNotificationLink(item) {
  const fromMeta = String(item?.linkPath || item?.metadata?.linkPath || "").trim();
  if (fromMeta.startsWith("/")) return fromMeta;
  const type = String(item?.type || "");
  const orderId = item?.orderId || item?.order;
  if ((type === "ecom_order_placed" || type === "ecom_order_status_updated") && orderId) {
    return `/admin/orders/ecom/${orderId}`;
  }
  if (type === "venue_booking_placed" && (item?.metadata?.bookingId || orderId)) {
    return `/admin/orders/venue/${item.metadata?.bookingId || orderId}`;
  }
  if (type === "vendor_registered" && item?.metadata?.vendorId) {
    return `/admin/vendors/${item.metadata.vendorId}`;
  }
  if (type === "venue_vendor_registered" && item?.metadata?.venueVendorId) {
    return `/admin/venue-vendors/${item.metadata.venueVendorId}`;
  }
  if (type === "product_pending_approval" && item?.metadata?.productId) {
    return `/admin/products/${item.metadata.productId}`;
  }
  return "";
}
