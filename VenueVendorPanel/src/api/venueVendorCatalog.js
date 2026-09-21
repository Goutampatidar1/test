import api, { normalizeApiError } from "../api.js";
import { normalizeCatalogOptions, unwrapCatalogList } from "../utils/catalogOptions.js";

export async function venueVendorListCategories({ limit = 100, page = 1, search = "" } = {}) {
  const q = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`/venue-vendor/catalog/categories?${q}`);
    return normalizeCatalogOptions(unwrapCatalogList(data));
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorListSubCategories({ category, limit = 200, page = 1 } = {}) {
  const q = new URLSearchParams({
    mode: "venue",
    limit: String(limit),
    page: String(page),
  });
  if (category) q.set("category", String(category));
  try {
    const { data } = await api.get(`/venue-vendor/catalog/sub-categories?${q}`);
    return normalizeCatalogOptions(unwrapCatalogList(data));
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function venueVendorListAmenities({ limit = 200, page = 1 } = {}) {
  const q = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });
  try {
    const { data } = await api.get(`/venue-vendor/catalog/amenities?${q}`);
    return normalizeCatalogOptions(unwrapCatalogList(data));
  } catch (error) {
    normalizeApiError(error);
  }
}
