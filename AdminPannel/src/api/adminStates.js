import api, { authHeader, normalizeApiError } from "../api.js";

function statesBase() {
  return "/admin/states";
}

export async function adminListStates(token, { page = 1, limit = 50, status, search, all } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (all) q.set("all", "true");
  try {
    const { data } = await api.get(`${statesBase()}?${q}`, { headers: authHeader(token) });
    return {
      states: Array.isArray(data.states) ? data.states : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateState(token, fields) {
  try {
    const { data } = await api.post(statesBase(), fields, { headers: authHeader(token) });
    return data.state;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateState(token, id, fields) {
  try {
    const { data } = await api.patch(`${statesBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.state;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteState(token, id) {
  try {
    await api.delete(`${statesBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}
