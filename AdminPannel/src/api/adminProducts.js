import api, { authHeader, normalizeApiError } from "../api.js";

function productsBase() {
  return "/admin/products";
}

export async function adminListProducts(
  token,
  {
    page = 1,
    limit = 10,
    status,
    search,
    role,
    addedById,
    category,
    subCategory,
    variantType,
    adminApproved,
  } = {}
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
  if (variantType) q.set("variantType", String(variantType));
  if (adminApproved !== undefined && adminApproved !== "") {
    q.set("adminApproved", String(adminApproved));
  }

  try {
    const { data } = await api.get(`${productsBase()}?${q}`, { headers: authHeader(token) });
    return {
      products: Array.isArray(data.products) ? data.products : [],
      pagination: data.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetProductById(token, id) {
  try {
    const { data } = await api.get(`${productsBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminCreateProduct(token, fields) {
  try {
    const isFormData = typeof FormData !== "undefined" && fields instanceof FormData;
    const { data } = await api.post(
      productsBase(),
      isFormData
        ? fields
        : {
            ...fields,
            combinations: Array.isArray(fields.combinations) ? fields.combinations : [],
          },
      { headers: authHeader(token) }
    );
    return data.product;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateProduct(token, id, fields) {
  try {
    const isFormData = typeof FormData !== "undefined" && fields instanceof FormData;
    const { data } = await api.patch(
      `${productsBase()}/${encodeURIComponent(id)}`,
      isFormData
        ? fields
        : {
            ...fields,
            ...(fields.combinations !== undefined
              ? { combinations: Array.isArray(fields.combinations) ? fields.combinations : [] }
              : {}),
          },
      { headers: authHeader(token) }
    );
    return data.product;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteProduct(token, id) {
  try {
    await api.delete(`${productsBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminApproveProduct(token, id) {
  try {
    const { data } = await api.post(`${productsBase()}/${encodeURIComponent(id)}/approve`, null, {
      headers: authHeader(token),
    });
    return data.product;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminRejectProduct(token, id) {
  try {
    const { data } = await api.post(`${productsBase()}/${encodeURIComponent(id)}/reject`, null, {
      headers: authHeader(token),
    });
    return data.product;
  } catch (error) {
    normalizeApiError(error);
  }
}
