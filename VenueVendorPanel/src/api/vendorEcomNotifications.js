import api, { normalizeApiError } from "../api.js";

export async function vendorEcomListNotifications({ page = 1, limit = 20, unreadOnly } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (unreadOnly) q.set("unreadOnly", "true");
  try {
    const { data } = await api.get(`/vendor/notifications?${q}`);
    return {
      notifications: Array.isArray(data.data) ? data.data : [],
      unreadCount: Number(data.unreadCount) || 0,
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomMarkNotificationRead(id) {
  try {
    const { data } = await api.patch(`/vendor/notifications/${encodeURIComponent(id)}/read`);
    return Array.isArray(data.data) ? data.data[0] : data.data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomMarkAllNotificationsRead() {
  try {
    await api.patch("/vendor/notifications/read-all");
  } catch (error) {
    normalizeApiError(error);
  }
}

export function vendorEcomNotificationLink(item) {
  const fromMeta = String(item?.linkPath || item?.metadata?.linkPath || "").trim();
  if (fromMeta.startsWith("/vendor")) return fromMeta;
  const type = String(item?.type || "");
  if (type.startsWith("ecom_order") || item?.orderId || item?.order) {
    return "/vendor/orders";
  }
  if (type.includes("promotion")) {
    return "/vendor/promotions";
  }
  return "";
}
