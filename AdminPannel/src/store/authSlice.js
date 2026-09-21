import { createSlice } from "@reduxjs/toolkit";

const STORAGE_KEY = "oho_admin_auth";

function readStoredAuth() {
  if (typeof window === "undefined") {
    return { adminToken: null, refreshToken: null, admin: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { adminToken: null, refreshToken: null, admin: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { adminToken: null, refreshToken: null, admin: null };

    const adminToken =
      typeof parsed.adminToken === "string"
        ? parsed.adminToken
        : typeof parsed.token === "string"
          ? parsed.token
          : null;
    const refreshToken =
      typeof parsed.refreshToken === "string"
        ? parsed.refreshToken
        : null;

    const admin =
      parsed.admin && typeof parsed.admin === "object"
        ? parsed.admin
        : parsed.user && typeof parsed.user === "object"
          ? parsed.user
          : null;

    return { adminToken, refreshToken, admin };
  } catch {
    return { adminToken: null, refreshToken: null, admin: null };
  }
}

function writeStoredAuth(adminToken, refreshToken, admin) {
  if (typeof window === "undefined") return;
  try {
    if (adminToken && refreshToken && admin) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ adminToken, refreshToken, admin }));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* Safari private mode can block storage */
  }
}

const initialState = readStoredAuth();

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action) {
      state.adminToken = action.payload.adminToken;
      state.refreshToken = action.payload.refreshToken ?? null;
      state.admin = action.payload.admin;
      writeStoredAuth(state.adminToken, state.refreshToken, state.admin);
    },
    setAdmin(state, action) {
      state.admin = action.payload;
      writeStoredAuth(state.adminToken, state.refreshToken, state.admin);
    },
    setTokens(state, action) {
      state.adminToken = action.payload.adminToken ?? state.adminToken;
      state.refreshToken = action.payload.refreshToken ?? state.refreshToken;
      writeStoredAuth(state.adminToken, state.refreshToken, state.admin);
    },
    logout(state) {
      state.adminToken = null;
      state.refreshToken = null;
      state.admin = null;
      writeStoredAuth(null, null, null);
    },
  },
});

export const { setCredentials, setAdmin, setTokens, logout } = authSlice.actions;
export default authSlice.reducer;
