import { createSlice } from "@reduxjs/toolkit";
import { writeStoredAuth } from "../api.js";
import { normalizeEcomProfileUser } from "../api/vendorEcom.js";
import { normalizePanelMode } from "../utils/panelMode.js";

function normalizeAccountUser(mode, user) {
  if (!user) return user;
  return mode === "ecom" ? normalizeEcomProfileUser(user) : user;
}

const STORAGE_KEY = "oho_venue_vendor_auth";

function migrateLegacyAuth(parsed) {
  if (!parsed?.token || !parsed?.user) return parsed;
  if (parsed.panelMode && parsed.capabilities) return parsed;

  return {
    ...parsed,
    panelMode: "service",
    capabilities: ["service"],
    vendorPanelType: "service",
    accounts: {
      service: {
        token: parsed.token,
        refreshToken: parsed.refreshToken ?? null,
        user: parsed.user,
        approvalStatus: parsed.user?.approvalStatus ?? null,
      },
    },
  };
}

function readStoredAuth() {
  if (typeof window === "undefined") {
    return emptyAuthState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAuthState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyAuthState();

    const migrated = migrateLegacyAuth(parsed);
    const token = typeof migrated.token === "string" ? migrated.token : null;
    const refreshToken = typeof migrated.refreshToken === "string" ? migrated.refreshToken : null;
    const user = migrated.user && typeof migrated.user === "object" ? migrated.user : null;
    const panelMode = normalizePanelMode(migrated.panelMode);
    const capabilities = Array.isArray(migrated.capabilities) ? migrated.capabilities : ["service"];
    const vendorPanelType = migrated.vendorPanelType || (capabilities.length > 1 ? "both" : panelMode);
    const accounts =
      migrated.accounts && typeof migrated.accounts === "object" ? migrated.accounts : {};

    return {
      token,
      refreshToken,
      user,
      panelMode,
      capabilities,
      vendorPanelType,
      accounts,
    };
  } catch {
    return emptyAuthState();
  }
}

function emptyAuthState() {
  return {
    token: null,
    refreshToken: null,
    user: null,
    panelMode: "service",
    capabilities: [],
    vendorPanelType: null,
    accounts: {},
  };
}

function persist(state) {
  if (!state.token || !state.user) {
    writeStoredAuth(null);
    return;
  }

  writeStoredAuth({
    token: state.token,
    refreshToken: state.refreshToken,
    user: state.user,
    panelMode: state.panelMode,
    capabilities: state.capabilities,
    vendorPanelType: state.vendorPanelType,
    accounts: state.accounts,
  });
}

const initialState = readStoredAuth();

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action) {
      const payload = action.payload || {};
      state.token = payload.token ?? null;
      state.refreshToken = payload.refreshToken ?? null;
      state.user = payload.user ?? null;
      state.panelMode = normalizePanelMode(payload.panelMode);
      state.capabilities = Array.isArray(payload.capabilities)
        ? payload.capabilities
        : state.capabilities;
      state.vendorPanelType = payload.vendorPanelType ?? state.vendorPanelType;
      state.accounts = payload.accounts && typeof payload.accounts === "object" ? payload.accounts : state.accounts;
      persist(state);
    },
    setUser(state, action) {
      state.user = action.payload;
      const mode = state.panelMode === "both" ? "service" : state.panelMode;
      if (state.accounts?.[mode]) {
        state.accounts[mode] = {
          ...state.accounts[mode],
          user: action.payload,
          approvalStatus:
            action.payload?.approvalStatus ?? state.accounts[mode].approvalStatus ?? null,
        };
      }
      persist(state);
    },
    setAccountUser(state, action) {
      const mode = action.payload?.mode;
      const user = normalizeAccountUser(mode, action.payload?.user);
      if (!mode || !user || !state.accounts?.[mode]) return;
      state.accounts[mode] = {
        ...state.accounts[mode],
        user,
        approvalStatus: user?.approvalStatus ?? state.accounts[mode].approvalStatus ?? null,
      };
      if (state.panelMode === mode) {
        state.user = user;
      }
      persist(state);
    },
    setPanelMode(state, action) {
      const nextMode = normalizePanelMode(action.payload);
      if (nextMode === "both") {
        if (!state.capabilities.includes("ecom") || !state.capabilities.includes("service")) return;
        state.panelMode = "both";
        const primary = state.accounts?.service || state.accounts?.ecom;
        if (primary?.token) {
          state.token = primary.token;
          state.refreshToken = primary.refreshToken ?? null;
          state.user = primary.user ?? state.user;
        }
        persist(state);
        return;
      }

      if (!state.capabilities.includes(nextMode)) return;
      const account = state.accounts?.[nextMode];
      if (!account?.token) return;

      state.panelMode = nextMode;
      state.token = account.token;
      state.refreshToken = account.refreshToken ?? null;
      state.user = normalizeAccountUser(nextMode, account.user ?? state.user);
      persist(state);
    },
    logout(state) {
      state.token = null;
      state.refreshToken = null;
      state.user = null;
      state.panelMode = "service";
      state.capabilities = [];
      state.vendorPanelType = null;
      state.accounts = {};
      persist(state);
    },
  },
});

export const { setCredentials, setUser, setAccountUser, logout, setPanelMode } = authSlice.actions;

export function selectPanelMode(state) {
  return state.auth.panelMode;
}

export function selectCapabilities(state) {
  return state.auth.capabilities ?? [];
}

export function selectHasBothCapabilities(state) {
  const caps = selectCapabilities(state);
  return caps.includes("ecom") && caps.includes("service");
}

export default authSlice.reducer;
