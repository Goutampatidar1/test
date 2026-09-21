import api, { authHeader, normalizeApiError } from "../api.js";

function attributesBase() {
  return "/admin/attributes";
}

export async function adminListAttributeTitles(token, { page = 1, limit = 50, status, search, category, subCategory, childCategory } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (category) q.set("category", String(category));
  if (subCategory) q.set("subCategory", String(subCategory));
  if (childCategory) q.set("childCategory", String(childCategory));
  try {
    const { data } = await api.get(`${attributesBase()}/titles?${q}`, { headers: authHeader(token) });
    return {
      attributeTitles: Array.isArray(data.attributeTitles) ? data.attributeTitles : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateAttributeTitle(token, fields) {
  try {
    const { data } = await api.post(
      `${attributesBase()}/titles`,
      {
        title: String(fields.title ?? "").trim(),
        category: String(fields.category ?? "").trim(),
        subCategory: String(fields.subCategory ?? "").trim(),
        ...(fields.childCategory !== undefined ? { childCategory: String(fields.childCategory) } : {}),
        status: String(fields.status || "active"),
      },
      { headers: authHeader(token) }
    );
    return data.attributeTitle;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateAttributeTitle(token, id, fields) {
  const payload = {};
  if (fields.title !== undefined) payload.title = String(fields.title).trim();
  if (fields.category !== undefined) payload.category = String(fields.category).trim();
  if (fields.subCategory !== undefined) payload.subCategory = String(fields.subCategory).trim();
  if (fields.childCategory !== undefined) payload.childCategory = String(fields.childCategory);
  if (fields.status !== undefined) payload.status = String(fields.status);
  try {
    const { data } = await api.patch(`${attributesBase()}/titles/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return data.attributeTitle;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteAttributeTitle(token, id) {
  try {
    await api.delete(`${attributesBase()}/titles/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminListAttributeValues(token, { page = 1, limit = 50, status, search, attributeTitle, category, subCategory, childCategory } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (attributeTitle) q.set("attributeTitle", String(attributeTitle));
  if (category) q.set("category", String(category));
  if (subCategory) q.set("subCategory", String(subCategory));
  if (childCategory) q.set("childCategory", String(childCategory));
  try {
    const { data } = await api.get(`${attributesBase()}/values?${q}`, { headers: authHeader(token) });
    return {
      attributeValues: Array.isArray(data.attributeValues) ? data.attributeValues : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateAttributeValue(token, fields) {
  try {
    const { data } = await api.post(
      `${attributesBase()}/values`,
      {
        attributeTitle: String(fields.attributeTitle ?? ""),
        value: String(fields.value ?? "").trim(),
        colorCode: fields.colorCode !== undefined ? String(fields.colorCode).trim() : "",
        status: String(fields.status || "active"),
      },
      { headers: authHeader(token) }
    );
    return data.attributeValue;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateAttributeValue(token, id, fields) {
  const payload = {};
  if (fields.attributeTitle !== undefined) payload.attributeTitle = String(fields.attributeTitle);
  if (fields.value !== undefined) payload.value = String(fields.value).trim();
  if (fields.colorCode !== undefined) payload.colorCode = String(fields.colorCode).trim();
  if (fields.status !== undefined) payload.status = String(fields.status);
  try {
    const { data } = await api.patch(`${attributesBase()}/values/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return data.attributeValue;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteAttributeValue(token, id) {
  try {
    await api.delete(`${attributesBase()}/values/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}
