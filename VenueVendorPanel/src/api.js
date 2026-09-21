import axios from "axios";
import { expireSession, isPublicAuthRequestUrl } from "./utils/authSession.js";
import {
  getAuthTokenForRequest,
  getRefreshTokenForApiMode,
  normalizePanelMode,
  resolveApiModeFromRequestUrl,
} from "./utils/panelMode.js";
import { resolveApiBase } from "./resolveApiBase.js";

const AUTH_STORAGE_KEY = "oho_venue_vendor_auth";

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
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredAuth(nextAuth) {
  if (typeof window === "undefined") return;
  try {
    if (!nextAuth?.token || !nextAuth?.user) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
  } catch {
    /* Safari private mode can block storage */
  }
}

let refreshPromise = null;

async function refreshPanelToken(requestUrl = "") {
  if (refreshPromise) return refreshPromise;

  const current = readStoredAuth();
  const panelMode = normalizePanelMode(current?.panelMode);
  const apiMode =
    panelMode === "both"
      ? resolveApiModeFromRequestUrl(requestUrl)
      : panelMode;
  const refreshToken = getRefreshTokenForApiMode(current, apiMode);
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }

  refreshPromise = axios
    .post(`${getApiBase()}/api/vendor-panel/auth/refresh`, { refreshToken, mode: apiMode })
    .then(({ data }) => {
      const payload = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
      const nextToken = payload?.token || data?.token;
      const nextRefresh = payload?.refreshToken || data?.refreshToken || refreshToken;
      if (!nextToken) {
        throw new Error("Refresh did not return token");
      }

      const accounts = { ...(current?.accounts || {}) };
      if (accounts[apiMode]) {
        accounts[apiMode] = {
          ...accounts[apiMode],
          token: nextToken,
          refreshToken: nextRefresh,
        };
      }

      const updated = {
        ...current,
        token:
          panelMode === "both"
            ? accounts.service?.token || accounts.ecom?.token || nextToken
            : nextToken,
        refreshToken:
          panelMode === "both"
            ? accounts.service?.refreshToken || accounts.ecom?.refreshToken || nextRefresh
            : nextRefresh,
        accounts,
      };
      writeStoredAuth(updated);
      return nextToken;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const auth = readStoredAuth();
  const token = getAuthTokenForRequest(auth, config.url);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
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
      !isPublicAuthRequestUrl(requestUrl)
    ) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshPanelToken(requestUrl);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        writeStoredAuth(null);
        expireSession();
      }
    }

    if (status === 401 && originalRequest?._retry && !isPublicAuthRequestUrl(requestUrl)) {
      expireSession();
    }

    return Promise.reject(error);
  },
);

export function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function normalizeApiError(error) {
  const data = error?.response?.data;
  const status = error?.response?.status;
  const message =
    data?.message || data?.error || error?.message || (status ? `Request failed (${status})` : "Request failed");
  const err = new Error(message);
  err.status = status;
  err.body = data;
  throw err;
}

export default api;
