import api, { normalizeApiError } from "../api.js";

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
    "priceType",
    "price",
    "tokenAmount",
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
}

export async function vendorListVenues({ page = 1, limit = 100, search, status } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (search?.trim()) q.set("search", search.trim());
  if (status) q.set("status", status);
  try {
    const { data } = await api.get(`/venue-vendor/venues?${q}`);
    return {
      venues: Array.isArray(data.venues) ? data.venues : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorGetVenueById(id) {
  try {
    const { data } = await api.get(`/venue-vendor/venues/${encodeURIComponent(id)}`);
    return data.venue;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorUpdateVenue(id, fields, files = {}) {
  const hasFiles =
    files.thumbnail instanceof File ||
    (Array.isArray(files.images) && files.images.some((f) => f instanceof File));
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
      const { data } = await api.patch(`/venue-vendor/venues/${encodeURIComponent(id)}`, fd);
      return data.venue;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.patch(`/venue-vendor/venues/${encodeURIComponent(id)}`, fields);
    return data.venue;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorUpdateVenueStatus(id, status) {
  try {
    const { data } = await api.patch(`/venue-vendor/venues/${encodeURIComponent(id)}`, { status });
    return data.venue;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorDeleteVenue(id) {
  try {
    await api.delete(`/venue-vendor/venues/${encodeURIComponent(id)}`);
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function vendorCreateVenue(fields, files = {}) {
  const fd = new FormData();
  appendFields(fd, fields);
  if (files.thumbnail instanceof File) fd.append("thumbnail", files.thumbnail);
  if (Array.isArray(files.images)) {
    for (const image of files.images) {
      if (image instanceof File) fd.append("images", image);
    }
  }
  try {
    const { data } = await api.post("/venue-vendor/venues", fd);
    return data.venue;
  } catch (error) {
    normalizeApiError(error);
  }
}
