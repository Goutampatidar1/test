import api, { normalizeApiError } from "../api.js";
import { normalizeCatalogOptions, unwrapCatalogList } from "../utils/catalogOptions.js";

export async function publicListCategories({
  mode = "venue",
  limit = 100,
  page = 1,
  includeEmpty = false,
} = {}) {
  const q = new URLSearchParams({
    mode,
    limit: String(limit),
    page: String(page),
  });
  if (includeEmpty) q.set("includeEmpty", "true");
  try {
    const { data } = await api.get(`/public/categories?${q}`);
    return normalizeCatalogOptions(unwrapCatalogList(data));
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function publicListVenueTypes({ limit = 100, page = 1 } = {}) {
  const q = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });
  try {
    const { data } = await api.get(`/public/venue-types/all?${q}`);
    return normalizeCatalogOptions(unwrapCatalogList(data));
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function publicListSubCategories({ category, mode = "venue", limit = 200, page = 1 } = {}) {
  const q = new URLSearchParams({
    mode,
    limit: String(limit),
    page: String(page),
  });
  if (category) q.set("category", String(category));
  try {
    const { data } = await api.get(`/public/sub-categories?${q}`);
    return normalizeCatalogOptions(unwrapCatalogList(data));
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function publicListAmenities({ limit = 200, page = 1 } = {}) {
  const q = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });
  try {
    const { data } = await api.get(`/public/amenities?${q}`);
    return normalizeCatalogOptions(unwrapCatalogList(data));
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function publicListBanners({ type = "venue", city } = {}) {
  const q = new URLSearchParams({ type: String(type) });
  if (city) q.set("city", String(city));
  try {
    const { data } = await api.get(`/public/banners?${q}`);
    const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return items.filter(Boolean);
  } catch (error) {
    normalizeApiError(error);
  }
}
