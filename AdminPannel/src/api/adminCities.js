import api, { authHeader, normalizeApiError } from "../api.js";

function citiesBase() {
  return "/admin/cities";
}

export async function adminListCities(
  token,
  { page = 1, limit = 50, status, search, state, all } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (state) q.set("state", String(state));
  if (all) q.set("all", "true");
  try {
    const { data } = await api.get(`${citiesBase()}?${q}`, { headers: authHeader(token) });
    return {
      cities: Array.isArray(data.cities) ? data.cities : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateCity(token, fields) {
  try {
    const { data } = await api.post(citiesBase(), fields, { headers: authHeader(token) });
    return data.city;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateCity(token, id, fields) {
  try {
    const { data } = await api.patch(`${citiesBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.city;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteCity(token, id) {
  try {
    await api.delete(`${citiesBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}
