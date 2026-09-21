import { configureStore } from "@reduxjs/toolkit";
import appConfigReducer from "./appConfigSlice.js";
import authReducer from "./authSlice.js";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    appConfig: appConfigReducer,
  },
});
