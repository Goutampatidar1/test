import api, { authHeader, normalizeApiError } from "../api.js";

function venuesBase() {
  return "/admin/venues";
}

export async function adminListVenues(
  token,
  { page = 1, limit = 10, status, search, role, addedById, category, subCategory, city } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", String(status));
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (role) q.set("role", String(role));
  if (addedById) q.set("addedById", String(addedById));
  if (category) q.set("category", String(category));
  if (subCategory) q.set("subCategory", String(subCategory));
  if (city) q.set("city", String(city));

  try {
    const { data } = await api.get(`${venuesBase()}?${q}`, { headers: authHeader(token) });
    return {
      venues: Array.isArray(data.venues) ? data.venues : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetVenueById(token, id) {
  try {
    const { data } = await api.get(`${venuesBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return data.venue;
  } catch (error) {
    normalizeApiError(error);
  }
}

function appendFields(fd, fields = {}) {
  const keys = [
    "name",
    "description",
    "shortDescription",
    "category",
    "subCategory",
    "address",
    "city",
    "state",
    "pincode",
    "latitude",
    "longitude",
    "capacity",
    "carpetArea",
    "basePrice",
    "dayPrice",
    "hourlyPrice",
    "tokenAmountPercentage",
    "role",
    "addedById",
    "status",
  ];
  keys.forEach((key) => {
    if (fields[key] === undefined) return;
    fd.append(key, fields[key] == null ? "" : String(fields[key]));
  });
  if (fields.amenities !== undefined) {
    fd.append("amenities", JSON.stringify(Array.isArray(fields.amenities) ? fields.amenities : []));
  }
  if (fields.images !== undefined) {
    fd.append("images", JSON.stringify(Array.isArray(fields.images) ? fields.images : []));
  }
}

export async function adminCreateVenue(token, fields, files = {}) {
  const hasFiles = files.thumbnail instanceof File || (Array.isArray(files.images) && files.images.some((f) => f instanceof File));
  if (hasFiles) {
    const fd = new FormData();
    appendFields(fd, fields);
    if (files.thumbnail instanceof File) fd.append("thumbnail", files.thumbnail);
    if (Array.isArray(files.images)) {
      for (const image of files.images) {
        if (image instanceof File) fd.append("images", image);
      }
    }
    try {
      const { data } = await api.post(venuesBase(), fd, { headers: authHeader(token) });
      return data.venue;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.post(venuesBase(), fields, { headers: authHeader(token) });
    return data.venue;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateVenue(token, id, fields, files = {}) {
  const hasFiles = files.thumbnail instanceof File || (Array.isArray(files.images) && files.images.some((f) => f instanceof File));
  if (hasFiles) {
    const fd = new FormData();
    appendFields(fd, fields);
    if (files.thumbnail instanceof File) fd.append("thumbnail", files.thumbnail);
    if (Array.isArray(files.images)) {
      for (const image of files.images) {
        if (image instanceof File) fd.append("images", image);
      }
    }
    try {
      const { data } = await api.patch(`${venuesBase()}/${encodeURIComponent(id)}`, fd, {
        headers: authHeader(token),
      });
      return data.venue;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.patch(`${venuesBase()}/${encodeURIComponent(id)}`, fields, {
      headers: authHeader(token),
    });
    return data.venue;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteVenue(token, id) {
  try {
    await api.delete(`${venuesBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}
