import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getPublicAppConfig } from "../api/publicAppConfig.js";

function normalizeConfigPayload(body) {
  if (!body || typeof body !== "object") return null;
  const raw = body.data;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

export const fetchPublicAppConfig = createAsyncThunk(
  "appConfig/fetchPublic",
  async (_, { rejectWithValue }) => {
    try {
      const body = await getPublicAppConfig();
      return normalizeConfigPayload(body);
    } catch (e) {
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
    builder
      .addCase(fetchPublicAppConfig.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPublicAppConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchPublicAppConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = typeof action.payload === "string" ? action.payload : "Request failed";
      });
  },
});

export const { clearAppConfig } = appConfigSlice.actions;
export default appConfigSlice.reducer;
