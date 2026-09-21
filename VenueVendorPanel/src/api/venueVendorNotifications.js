import api, { normalizeApiError } from "../api.js";

export async function venueVendorListNotifications({ page = 1, limit = 20, unreadOnly } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (unreadOnly) q.set("unreadOnly", "true");
  try {
    const { data } = await api.get(`/venue-vendor/notifications?${q}`);
    return {
      notifications: Array.isArray(data.data) ? data.data : [],
      unreadCount: Number(data.unreadCount) || 0,
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorMarkNotificationRead(id) {
  try {
    const { data } = await api.patch(`/venue-vendor/notifications/${encodeURIComponent(id)}/read`);
    return Array.isArray(data.data) ? data.data[0] : data.data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorMarkAllNotificationsRead() {
  try {
    await api.patch("/venue-vendor/notifications/read-all");
  } catch (error) {
    normalizeApiError(error);
  }
}

export function venueVendorNotificationLink(item) {
  const fromMeta = String(item?.linkPath || item?.metadata?.linkPath || "").trim();
  if (fromMeta.startsWith("/")) return fromMeta;
  const type = String(item?.type || "");
  const bookingId = item?.metadata?.bookingId || item?.orderId || item?.order;
  if (type === "venue_booking_placed" && bookingId) {
    return `/vendor/bookings/${bookingId}`;
  }
  return "";
}
