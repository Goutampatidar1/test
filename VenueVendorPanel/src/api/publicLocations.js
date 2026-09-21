import api, { normalizeApiError } from "../api.js";

function unwrapLocationItems(body) {
  if (!body || typeof body !== "object") return [];
  const raw = body.data;
  if (Array.isArray(raw)) {
    if (raw.length > 0 && Array.isArray(raw[0]?.items)) return raw[0].items;
    return raw;
  }
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(body.cities)) return body.cities;
  if (Array.isArray(body.subDistricts)) return body.subDistricts;
  return [];
}

export async function publicListCities({ limit = 500, search } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`/public/cities?${q}`);
    return unwrapLocationItems(data);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function publicListSubDistricts({ city, limit = 500, search } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (city) q.set("city", String(city));
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`/public/sub-districts?${q}`);
    return unwrapLocationItems(data);
  } catch (error) {
    normalizeApiError(error);
  }
}
