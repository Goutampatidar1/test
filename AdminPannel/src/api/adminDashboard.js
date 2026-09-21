import api, { authHeader, normalizeApiError } from "../api.js";

function dashboardBase() {
  return "/admin/dashboard";
}

export async function adminGetDashboardStats(token) {
  try {
    const { data: body } = await api.get(`${dashboardBase()}/stats`, {
      headers: authHeader(token),
    });
    return body?.stats ?? null;
  } catch (error) {
    normalizeApiError(error);
  }
}
