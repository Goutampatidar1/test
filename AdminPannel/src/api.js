import axios from "axios";
import { expireSession, isPublicAuthRequestUrl } from "./utils/authSession.js";
import { resolveApiBase } from "./resolveApiBase.js";

const AUTH_STORAGE_KEY = "oho_admin_auth";

const API_BASE = resolveApiBase();

export function getApiBase() {
  return API_BASE.replace(/\/$/, "");
}

const api = axios.create({
  baseURL: `${API_BASE}/api`,
});

function readStoredAuth() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAuth(nextAuth) {
  if (typeof window === "undefined") return;
  try {
    if (!nextAuth?.adminToken || !nextAuth?.refreshToken || !nextAuth?.admin) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
  } catch {
    /* Safari private mode can block storage */
  }
}

let refreshPromise = null;

async function refreshAdminToken() {
  if (refreshPromise) return refreshPromise;

  const current = readStoredAuth();
  const refreshToken = current?.refreshToken;
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }

  refreshPromise = axios
    .post(`${API_BASE}/api/admin/auth/refresh`, { refreshToken })
    .then(({ data }) => {
      const updated = {
        ...current,
        adminToken: data?.token,
        refreshToken: data?.refreshToken || refreshToken,
      };
      writeStoredAuth(updated);
      return updated.adminToken;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const stored = readStoredAuth();
  const latestToken = stored?.adminToken;
  if (latestToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${latestToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config;
    const requestUrl = String(originalRequest?.url || "");

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !requestUrl.includes("/admin/auth/login") &&
      !requestUrl.includes("/admin/auth/refresh")
    ) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAdminToken();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        writeStoredAuth(null);
        if (!isPublicAuthRequestUrl(requestUrl)) {
          expireSession();
        }
      }
    }

    if (status === 401 && originalRequest?._retry && !isPublicAuthRequestUrl(requestUrl)) {
      expireSession();
    }

    return Promise.reject(error);
  }
);

export function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function normalizeApiError(error) {
  const data = error?.response?.data;
  const status = error?.response?.status;
  const isNetwork =
    !error?.response &&
    (error?.code === "ERR_NETWORK" ||
      error?.message === "Network Error" ||
      error?.code === "ECONNABORTED" ||
      error?.code === "ECONNREFUSED");
  const message = isNetwork
    ? "Cannot reach the server. Make sure the Backend is running, then try again."
    : data?.message || data?.error || error?.message || (status ? `Request failed (${status})` : "Request failed");
  const err = new Error(message);
  err.status = status;
  err.body = data;
  throw err;
}

export default api;