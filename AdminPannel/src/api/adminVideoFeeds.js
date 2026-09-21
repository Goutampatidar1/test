import api, { authHeader, normalizeApiError } from "../api.js";

function base() {
  return "/admin/video-feeds";
}

export async function adminListVideoFeeds(token, { page = 1, limit = 20, type = "all" } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (type) q.set("type", String(type));
  try {
    const { data } = await api.get(`${base()}?${q}`, { headers: authHeader(token) });
    return {
      videoFeeds: Array.isArray(data.videoFeeds)
        ? data.videoFeeds
        : Array.isArray(data.data)
          ? data.data
          : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateVideoFeed(token, fields = {}, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    fd.append(key, String(value));
  });
  if (files.video instanceof File) fd.append("video", files.video);
  if (files.thumbnail instanceof File) fd.append("thumbnail", files.thumbnail);
  try {
    const { data } = await api.post(base(), fd, { headers: authHeader(token) });
    return data?.data?.[0] || data?.data || data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateVideoFeed(token, feedId, fields = {}, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    fd.append(key, String(value));
  });
  if (files.video instanceof File) fd.append("video", files.video);
  if (files.thumbnail instanceof File) fd.append("thumbnail", files.thumbnail);
  try {
    const { data } = await api.patch(`${base()}/${encodeURIComponent(feedId)}`, fd, {
      headers: authHeader(token),
    });
    return data?.data?.[0] || data?.data || data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteVideoFeed(token, feedId, type) {
  try {
    const q = new URLSearchParams({ type: String(type || "") });
    const { data } = await api.delete(`${base()}/${encodeURIComponent(feedId)}?${q}`, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}
