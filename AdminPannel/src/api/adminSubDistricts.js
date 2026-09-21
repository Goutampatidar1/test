import api, { authHeader, normalizeApiError } from "../api.js";

function subDistrictsBase() {
  return "/admin/sub-districts";
}

export async function adminListSubDistricts(
  token,
  { page = 1, limit = 50, status, search, city, all } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (city) q.set("city", String(city));
  if (all) q.set("all", "true");
  try {
    const { data } = await api.get(`${subDistrictsBase()}?${q}`, { headers: authHeader(token) });
    return {
      subDistricts: Array.isArray(data.subDistricts) ? data.subDistricts : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateSubDistrict(token, fields) {
  try {
    const { data } = await api.post(subDistrictsBase(), fields, { headers: authHeader(token) });
    return data.subDistrict;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateSubDistrict(token, id, fields) {
  try {
    const { data } = await api.patch(`${subDistrictsBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.subDistrict;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteSubDistrict(token, id) {
  try {
    await api.delete(`${subDistrictsBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}
