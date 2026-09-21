import api, { authHeader, normalizeApiError } from "../api.js";

function usersBase() {
  return "/admin/users";
}

export async function adminListUsers(token, { page = 1, limit = 20, status, search } = {}) {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(limit));
  if (status) q.set("status", status);
  if (search && String(search).trim()) q.set("search", String(search).trim());
  try {
    const { data: body } = await api.get(`${usersBase()}?${q}`, {
      headers: authHeader(token),
    });
    return {
      users: Array.isArray(body.users) ? body.users : [],
      pagination: body.pagination ?? { page, limit, total: 0, pages: 1 },
    };
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminGetUser(token, id) {
  try {
    const { data: body } = await api.get(`${usersBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
    return body.user ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}

function appendUserFields(fd, fields) {
  const {
    name,
    email,
    password,
    phone,
    dob,
    gender,
    fcm_id,
    status,
    city,
    subDistrict,
    cityId,
    subDistrictId,
  } = fields;
  if (name != null) fd.append("name", String(name).trim());
  if (email != null) fd.append("email", String(email).trim());
  if (password != null && String(password).length > 0) fd.append("password", String(password));
  if (phone != null) fd.append("phone", String(phone).trim());
  if (dob !== undefined) fd.append("dob", dob === "" || dob == null ? "" : String(dob));
  if (gender != null) fd.append("gender", String(gender));
  if (fcm_id !== undefined) fd.append("fcm_id", fcm_id == null ? "" : String(fcm_id));
  if (status != null) fd.append("status", String(status));
  if (city !== undefined) fd.append("city", city == null ? "" : String(city));
  if (subDistrict !== undefined) fd.append("subDistrict", subDistrict == null ? "" : String(subDistrict));
  if (cityId !== undefined) fd.append("cityId", cityId == null ? "" : String(cityId));
  if (subDistrictId !== undefined) fd.append("subDistrictId", subDistrictId == null ? "" : String(subDistrictId));
}

/** Create user — JSON or multipart when `file` is a File. */
export async function adminCreateUser(token, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    appendUserFields(fd, fields);
    fd.append("file", file);
    try {
      const { data: body } = await api.post(usersBase(), fd, {
        headers: authHeader(token),
      });
      return body.user;
    } catch (error) {
      normalizeApiError(error);
    }
  }
  try {
    const { data: body } = await api.post(
      usersBase(),
      {
        name: fields.name,
        email: fields.email,
        password: fields.password,
        phone: fields.phone,
        dob: fields.dob === "" ? undefined : fields.dob,
        gender: fields.gender || "male",
        fcm_id: fields.fcm_id === "" ? undefined : fields.fcm_id,
        status: fields.status || "active",
        city: fields.city || undefined,
        subDistrict: fields.subDistrict || undefined,
        cityId: fields.cityId || undefined,
        subDistrictId: fields.subDistrictId || undefined,
      },
      { headers: authHeader(token) }
    );
    return body.user;
  } catch (error) {
    normalizeApiError(error);
  }
}

/** PATCH user — JSON or multipart when `file` is a File. */
export async function adminUpdateUser(token, id, fields, file) {
  if (file instanceof File) {
    const fd = new FormData();
    appendUserFields(fd, fields);
    fd.append("file", file);
    try {
      const { data: body } = await api.patch(`${usersBase()}/${encodeURIComponent(id)}`, fd, {
        headers: authHeader(token),
      });
      return body.user;
    } catch (error) {
      normalizeApiError(error);
    }
  }
  const payload = {};
  if (fields.name !== undefined) payload.name = fields.name;
  if (fields.email !== undefined) payload.email = fields.email;
  if (fields.password && String(fields.password).length > 0) payload.password = fields.password;
  if (fields.phone !== undefined) payload.phone = fields.phone;
  if (fields.dob !== undefined) payload.dob = fields.dob === "" ? null : fields.dob;
  if (fields.gender !== undefined) payload.gender = fields.gender;
  if (fields.fcm_id !== undefined) payload.fcm_id = fields.fcm_id;
  if (fields.status !== undefined) payload.status = fields.status;
  if (fields.city !== undefined) payload.city = fields.city;
  if (fields.subDistrict !== undefined) payload.subDistrict = fields.subDistrict;
  if (fields.cityId !== undefined) payload.cityId = fields.cityId;
  if (fields.subDistrictId !== undefined) payload.subDistrictId = fields.subDistrictId;
  try {
    const { data: body } = await api.patch(`${usersBase()}/${encodeURIComponent(id)}`, payload, {
      headers: authHeader(token),
    });
    return body.user;
  } catch (error) {
    normalizeApiError(error);
  }
}

export async function adminDeleteUser(token, id) {
  try {
    await api.delete(`${usersBase()}/${encodeURIComponent(id)}`, {
      headers: authHeader(token),
    });
  } catch (error) {
    normalizeApiError(error);
  }
}
