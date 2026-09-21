import api, { authHeader, normalizeApiError } from "../api.js";

function bannersBase() {
  return "/admin/banners";
}

function appendBannerFields(fd, fields, { includeAll = false } = {}) {
  const set = (key, value) => {
    if (includeAll || fields[key] !== undefined) {
      fd.append(key, String(value ?? ""));
    }
  };

  if (includeAll || fields.targetType !== undefined) set("targetType", fields.targetType ?? "ecom");
  if (includeAll || fields.mode !== undefined) set("mode", fields.mode ?? "");
  if (includeAll || fields.title !== undefined) set("title", fields.title ?? "");
  if (includeAll || fields.status !== undefined) set("status", fields.status || "active");
  if (includeAll || fields.startDate !== undefined) set("startDate", fields.startDate ?? "");
  if (includeAll || fields.endDate !== undefined) set("endDate", fields.endDate ?? "");
  if (includeAll || fields.category !== undefined) set("category", fields.category ?? "");
  if (includeAll || fields.related !== undefined) set("related", fields.related ?? "none");
  if (includeAll || fields.relatedId !== undefined) {
    const relatedId = String(fields.relatedId ?? "").trim();
    if (relatedId) fd.append("relatedId", relatedId);
  }
  if (Array.isArray(fields.cities)) {
    fields.cities.forEach((city) => fd.append("cities", String(city).trim()));
  }
}

export async function adminListBanners(token, { page = 1, limit = 50, status, search, mode, city, targetType } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (mode) q.set("mode", mode);
  if (city) q.set("city", city);
  if (targetType) q.set("targetType", targetType);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data } = await api.get(`${bannersBase()}?${q}`, { headers: authHeader(token) });
    return {
      banners: Array.isArray(data.banners) ? data.banners : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetBannerById(token, id) {
  try {
    const { data } = await api.get(`${bannersBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
    return data.banner;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateBanner(token, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    appendBannerFields(fd, fields, { includeAll: true });
    fd.append("file", file);
    try {
      const { data } = await api.post(bannersBase(), fd, { headers: authHeader(token) });
      return data.banner;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.post(
      bannersBase(),
      {
        targetType: String(fields.targetType ?? "ecom").trim(),
        mode: String(fields.mode ?? "").trim(),
        title: String(fields.title ?? "").trim(),
        image: String(fields.image ?? "").trim(),
        status: String(fields.status || "active"),
        startDate: String(fields.startDate ?? ""),
        endDate: String(fields.endDate ?? ""),
        category: fields.category !== undefined ? String(fields.category ?? "") : "",
        related: String(fields.related ?? "none").trim(),
        relatedId: fields.relatedId !== undefined ? String(fields.relatedId ?? "") : "",
        cities: Array.isArray(fields.cities) ? fields.cities.map((city) => String(city).trim()).filter(Boolean) : [],
      },
      { headers: authHeader(token) }
    );
    return data.banner;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateBanner(token, id, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    appendBannerFields(fd, fields);
    fd.append("file", file);
    try {
      const { data } = await api.patch(`${bannersBase()}/${encodeURIComponent(id)}`, fd, { headers: authHeader(token) });
      return data.banner;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  const payload = {};
  if (fields.targetType !== undefined) payload.targetType = String(fields.targetType).trim();
  if (fields.mode !== undefined) payload.mode = String(fields.mode).trim();
  if (fields.title !== undefined) payload.title = String(fields.title).trim();
  if (fields.status !== undefined) payload.status = String(fields.status);
  if (fields.image !== undefined) payload.image = String(fields.image).trim();
  if (fields.startDate !== undefined) payload.startDate = String(fields.startDate);
  if (fields.endDate !== undefined) payload.endDate = String(fields.endDate);
  if (fields.category !== undefined) payload.category = String(fields.category ?? "");
  if (fields.related !== undefined) payload.related = String(fields.related ?? "none").trim();
  if (fields.relatedId !== undefined) payload.relatedId = String(fields.relatedId ?? "");
  if (fields.cities !== undefined) {
    payload.cities = Array.isArray(fields.cities) ? fields.cities.map((city) => String(city).trim()).filter(Boolean) : [];
  }

  try {
    const { data } = await api.patch(`${bannersBase()}/${encodeURIComponent(id)}`, payload, { headers: authHeader(token) });
    return data.banner;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteBanner(token, id) {
  try {
    await api.delete(`${bannersBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}
