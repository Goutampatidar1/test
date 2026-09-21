import api, { authHeader, normalizeApiError } from "../api.js";

function rechargesBase() {
  return "/admin/recharges";
}

export async function adminListRecharges(
  token,
  { page = 1, limit = 10, type, status, search, userId } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (type) q.set("type", String(type));
  if (status) q.set("status", String(status));
  if (userId) q.set("userId", String(userId));
  if (search && String(search).trim()) q.set("search", String(search).trim());

  try {
    const { data } = await api.get(`${rechargesBase()}?${q}`, { headers: authHeader(token) });
    return {
      recharges: Array.isArray(data.recharges) ? data.recharges : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}
