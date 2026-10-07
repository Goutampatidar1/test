import api, { authHeader, getApiBase, normalizeApiError } from "../api.js";

function miscBase() {
  return "/admin/misc";
}

export async function getAppConfig(token) {
  try {
    const { data } = await api.get(`${miscBase()}/app-config`, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function postAppConfig(token, formData) {
  try {
    const { data } = await api.post(`${miscBase()}/app-config`, formData, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function patchAppConfig(token, formData) {
  try {
    const { data } = await api.patch(`${miscBase()}/app-config`, formData, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

/** Returns `null` when no app configuration exists yet (it must be created in Business settings first). */
export async function getFeatureSettings(token) {
  const body = await getAppConfig(token);
  const doc = Array.isArray(body?.data) ? body.data[0] : body?.data;
  return doc ? doc.feature_settings ?? {} : null;
}

/** Partial update: the server merges with the stored settings and fills defaults. */
export async function patchFeatureSettings(token, partial) {
  const body = await patchAppConfig(token, { feature_settings: partial });
  const doc = Array.isArray(body?.data) ? body.data[0] : body?.data;
  return doc?.feature_settings ?? null;
}

export async function listPages(token, params = {}) {
  try {
    const { data: body } = await api.get(`${miscBase()}/pages`, {
      headers: authHeader(token),
      params,
    });
    return Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function getPageById(token, id) {
  try {
    const { data: body } = await api.get(`${miscBase()}/pages/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return body.data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function createPage(token, payload) {
  try {
    const { data } = await api.post(`${miscBase()}/pages`, payload, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function updatePage(token, id, payload) {
  try {
    const { data } = await api.patch(`${miscBase()}/pages/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function deletePage(token, id) {
  try {
    const { data } = await api.delete(`${miscBase()}/pages/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function getStaticPageLayout(token, app) {
  try {
    const { data: body } = await api.get(`${miscBase()}/static-page-layout/${encodeURIComponent(app)}`, {
      headers: authHeader(token),
    });
    return body.data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function updateStaticPageLayout(token, app, payload) {
  try {
    const { data: body } = await api.patch(`${miscBase()}/static-page-layout/${encodeURIComponent(app)}`, payload, {
      headers: authHeader(token),
    });
    return body.data;
  } catch (error) {
    normalizeApiError(error);
  }
}
