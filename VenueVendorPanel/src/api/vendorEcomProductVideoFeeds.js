import api, { normalizeApiError } from "../api.js";

export async function vendorEcomListProductVideoFeeds({ page = 1, limit = 20 } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  try {
    const { data } = await api.get(`/vendor/product-video-feeds?${q}`);
    return {
      feeds: Array.isArray(data.data) ? data.data : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomCreateProductVideoFeed(fields = {}, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    fd.append(key, String(value));
  });
  if (files.video instanceof File) fd.append("video", files.video);
  if (files.thumbnail instanceof File) fd.append("thumbnail", files.thumbnail);
  try {
    const { data } = await api.post("/vendor/product-video-feed", fd);
    return data?.data?.[0] || data?.data || data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomUpdateProductVideoFeed(feedId, fields = {}, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    fd.append(key, String(value));
  });
  if (files.video instanceof File) fd.append("video", files.video);
  if (files.thumbnail instanceof File) fd.append("thumbnail", files.thumbnail);
  try {
    const { data } = await api.patch(`/vendor/product-video-feed/${encodeURIComponent(feedId)}`, fd);
    return data?.data?.[0] || data?.data || data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorEcomDeleteProductVideoFeed(feedId) {
  try {
    const { data } = await api.delete(`/vendor/product-video-feed/${encodeURIComponent(feedId)}`);
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}
