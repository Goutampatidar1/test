import api, { authHeader, normalizeApiError } from "../api.js";

export async function adminLogin({ email, password }) {
  try {
    const { data } = await api.post("/admin/auth/login", { email, password });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetMe(token) {
  try {
    const { data } = await api.get("/admin/auth/me", { headers: authHeader(token) });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminUpdateMe(token, body) {
  try {
    const { data } = await api.patch("/admin/auth/me", body, { headers: authHeader(token) });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}

/**
 * PATCH profile with optional image. Backend multer field name: `file`.
 * Send multipart only when `file` is set; otherwise use adminUpdateMe (JSON).
 */
export async function adminUpdateMeWithFile(token, { name, phone, file }) {
  const fd = new FormData();
  if (name != null && String(name).trim() !== "") fd.append("name", String(name).trim());
  if (phone != null && String(phone).trim() !== "") fd.append("phone", String(phone).trim());
  if (file instanceof File) fd.append("file", file);

  try {
    const { data } = await api.patch("/admin/auth/me", fd, { headers: authHeader(token) });
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}


/** Authenticated admin: verify current password and set a new one. */
export async function adminChangePassword(token, { currentPassword, newPassword }) {
  try {
    const { data } = await api.patch(
      "/admin/auth/me/password",
      { currentPassword, newPassword },
      { headers: authHeader(token) }
    );
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}