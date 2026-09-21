import api, { authHeader, normalizeApiError } from "../api.js";

function categoriesBase() {
  return "/admin/categories";
}

export async function adminListCategories(
  token,
  { page = 1, limit = 50, status, search, mode, role, addedById, listed } = {}
) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  if (mode) q.set("mode", String(mode));
  if (role) q.set("role", String(role));
  if (addedById) q.set("addedById", String(addedById));
  if (listed) q.set("listed", "true");
  try {
    const { data } = await api.get(`${categoriesBase()}?${q}`, { headers: authHeader(token) });
    return {
      categories: Array.isArray(data.categories) ? data.categories : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateCategory(token, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    fd.append("name", String(fields.name ?? "").trim());
    fd.append("description", String(fields.description ?? "").trim());
    fd.append("status", String(fields.status || "active"));
    if (fields.mode !== undefined) fd.append("mode", String(fields.mode));
    if (fields.role !== undefined) fd.append("role", String(fields.role));
    if (fields.addedById !== undefined) fd.append("addedById", String(fields.addedById));
    fd.append("file", file);
    try {
      const { data } = await api.post(categoriesBase(), fd, { headers: authHeader(token) });
      return data.category;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  try {
    const { data } = await api.post(
      categoriesBase(),
      {
        name: String(fields.name ?? "").trim(),
        description: String(fields.description ?? "").trim(),
        image: String(fields.image ?? "").trim(),
        status: String(fields.status || "active"),
        mode: String(fields.mode || "ecom"),
        role: String(fields.role || "Admin"),
        addedById: fields.addedById ? String(fields.addedById) : undefined,
      },
      { headers: authHeader(token) }
    );
    return data.category;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateCategory(token, id, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    if (fields.name !== undefined) fd.append("name", String(fields.name).trim());
    if (fields.description !== undefined) fd.append("description", String(fields.description).trim());
    if (fields.status !== undefined) fd.append("status", String(fields.status));
    if (fields.mode !== undefined) fd.append("mode", String(fields.mode));
    if (fields.role !== undefined) fd.append("role", String(fields.role));
    if (fields.addedById !== undefined) fd.append("addedById", String(fields.addedById));
    fd.append("file", file);
    try {
      const { data } = await api.patch(`${categoriesBase()}/${encodeURIComponent(id)}`, fd, {
        headers: authHeader(token),
      });
      return data.category;
    } catch (error) {
      normalizeApiError(error);
    }
  }

  const payload = {};
  if (fields.name !== undefined) payload.name = String(fields.name).trim();
  if (fields.description !== undefined) payload.description = String(fields.description).trim();
  if (fields.status !== undefined) payload.status = String(fields.status);
  if (fields.image !== undefined) payload.image = String(fields.image).trim();
  if (fields.mode !== undefined) payload.mode = String(fields.mode);
  if (fields.role !== undefined) payload.role = String(fields.role);
  if (fields.addedById !== undefined) payload.addedById = String(fields.addedById);
  try {
    const { data } = await api.patch(`${categoriesBase()}/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return data.category;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteCategory(token, id) {
  try {
    await api.delete(`${categoriesBase()}/${encodeURIComponent(id)}`, { headers: authHeader(token) });
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminApproveCategory(token, id) {
  try {
    const { data } = await api.post(
      `${categoriesBase()}/${encodeURIComponent(id)}/approve`,
      {},
      { headers: authHeader(token) }
    );
    return data.category;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminRejectCategory(token, id) {
  try {
    const { data } = await api.post(
      `${categoriesBase()}/${encodeURIComponent(id)}/reject`,
      {},
      { headers: authHeader(token) }
    );
    return data.category;
  } catch (error) {
    normalizeApiError(error);
  }
}
