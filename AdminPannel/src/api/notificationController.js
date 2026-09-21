import api, { authHeader, normalizeApiError } from "../api.js";

function notificationsBase() {
  return "/admin/notifications";
}

export async function adminListNotifications(
  token,
  { page = 1, limit = 10, status, audienceType, kind, search } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (audienceType) q.set("audienceType", audienceType);
  if (kind) q.set("kind", kind);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`${notificationsBase()}?${q}`, {
      headers: authHeader(token),
    });
    return {
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateNotification(token, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    fd.append("audienceType", String(fields.audienceType ?? "").trim());
    fd.append("message", String(fields.message ?? "").trim());
    fd.append("status", String(fields.status || "active"));
    if (fields.kind !== undefined) fd.append("kind", String(fields.kind));
    if (fields.vendorTargetTypes !== undefined) {
      fd.append("vendorTargetTypes", JSON.stringify(fields.vendorTargetTypes));
    }
    fd.append("file", file);
    try {
      const { data } = await api.post(notificationsBase(), fd, {
        headers: authHeader(token),
      });
      return data.notification;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.post(
      notificationsBase(),
      {
        audienceType: String(fields.audienceType ?? "").trim(),
        message: String(fields.message ?? "").trim(),
        image: String(fields.image ?? "").trim(),
        status: String(fields.status || "active"),
        kind: String(fields.kind || "notification"),
        vendorTargetTypes: Array.isArray(fields.vendorTargetTypes) ? fields.vendorTargetTypes : [],
      },
      { headers: authHeader(token) }
    );
    return data.notification;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateNotification(token, id, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    if (fields.audienceType !== undefined) {
      fd.append("audienceType", String(fields.audienceType).trim());
    }
    if (fields.message !== undefined) fd.append("message", String(fields.message).trim());
    if (fields.status !== undefined) fd.append("status", String(fields.status));
    if (fields.kind !== undefined) fd.append("kind", String(fields.kind));
    if (fields.vendorTargetTypes !== undefined) {
      fd.append("vendorTargetTypes", JSON.stringify(fields.vendorTargetTypes));
    }
    fd.append("file", file);
    try {
      const { data } = await api.patch(`${notificationsBase()}/${encodeURIComponent(id)}`, fd, {
        headers: authHeader(token),
      });
      return data.notification;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  const payload = {};
  if (fields.audienceType !== undefined) payload.audienceType = String(fields.audienceType).trim();
  if (fields.message !== undefined) payload.message = String(fields.message).trim();
  if (fields.image !== undefined) payload.image = String(fields.image).trim();
  if (fields.status !== undefined) payload.status = String(fields.status);
  if (fields.kind !== undefined) payload.kind = String(fields.kind);
  if (fields.vendorTargetTypes !== undefined) payload.vendorTargetTypes = fields.vendorTargetTypes;

  try {
    const { data } = await api.patch(`${notificationsBase()}/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return data.notification;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteNotification(token, id) {
  try {
    await api.delete(`${notificationsBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}
