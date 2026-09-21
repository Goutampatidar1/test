import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getAppConfig } from "../api/adminMisc.js";
import { getPublicAppConfig } from "../api/publicAppConfig.js";
import { logout } from "./authSlice.js";

function normalizeConfigPayload(body) {
  if (!body || typeof body !== "object") return null;
  const raw = body.data ?? null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/** Unauthenticated — login / favicon / document title. */ 
export const fetchPublicAppConfig = createAsyncThunk(
  "appConfig/fetchPublic",
  async (_, { rejectWithValue }) => {
    try {
      const body = await getPublicAppConfig();
      return normalizeConfigPayload(body);
    } catch (e) {
      return rejectWithValue(e.message || "Failed to load public app configuration");
    }
  },
);

/** Authenticated admin — full record including `admin_logo`. */
export const fetchAppConfig = createAsyncThunk(
  "appConfig/fetch",
  async (adminToken, { dispatch, rejectWithValue }) => {
    if (!adminToken) {
      return rejectWithValue("Missing admin token");
    }
    try {
      const body = await getAppConfig(adminToken);
      return normalizeConfigPayload(body);
    } catch (e) {
      if (e?.status === 401) {
        dispatch(logout());
      }
      return rejectWithValue(e.message || "Failed to load app configuration");
    }
  },
);

const appConfigSlice = createSlice({
  name: "appConfig",
  initialState: {
    data: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearAppConfig(state) {
      state.data = null;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers(builder) {
    const pending = (state) => {
      state.loading = true;
      state.error = null;
    };
    const fulfilled = (state, action) => {
      state.loading = false;
      state.data = action.payload;
    };
    const rejected = (state, action) => {
      state.loading = false;
      state.error = typeof action.payload === "string" ? action.payload : "Request failed";
    };

    builder
      .addCase(fetchPublicAppConfig.pending, pending)
      .addCase(fetchPublicAppConfig.fulfilled, fulfilled)
      .addCase(fetchPublicAppConfig.rejected, rejected)
      .addCase(fetchAppConfig.pending, pending)
      .addCase(fetchAppConfig.fulfilled, fulfilled)
      .addCase(fetchAppConfig.rejected, rejected);
  },
});

export const { clearAppConfig } = appConfigSlice.actions;
export default appConfigSlice.reducer;
