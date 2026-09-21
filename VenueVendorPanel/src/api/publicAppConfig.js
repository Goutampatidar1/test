import api, { normalizeApiError } from "../api.js";

export async function getPublicAppConfig() {
  try {
    const { data } = await api.get("/public/app-config");
    return data;
  } catch (error) {
    normalizeApiError(error);
  }
}
