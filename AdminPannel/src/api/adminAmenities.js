import api, { authHeader, normalizeApiError } from "../api.js";

function amenitiesBase() {
  return "/admin/amenities";
}

export async function adminListAmenities(token, { page = 1, limit = 10, status, search, role, addedById } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", String(status));
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (role) q.set("role", String(role));
  if (addedById) q.set("addedById", String(addedById));
  try {
    const { data } = await api.get(`${amenitiesBase()}?${q}`, { headers: authHeader(token) });
    return {
      amenities: Array.isArray(data.amenities) ? data.amenities : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetAmenityById(token, id) {
  try {
    const { data } = await api.get(`${amenitiesBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return data.amenity;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateAmenity(token, fields) {
  try {
    const { data } = await api.post(amenitiesBase(), fields, { headers: authHeader(token) });
    return data.amenity;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateAmenity(token, id, fields) {
  try {
    const { data } = await api.patch(`${amenitiesBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.amenity;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteAmenity(token, id) {
  try {
    await api.delete(`${amenitiesBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}
