import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { store } from "./store/index.js";
import { configureAuthSession } from "./utils/authSession.js";
import { installBrokenImageFallback } from "./utils/imageFallback.js";

configureAuthSession(store);
installBrokenImageFallback();
import "bootstrap/dist/css/bootstrap.min.css";
import "sweetalert2/dist/sweetalert2.min.css";
import "../../AdminPannel/src/admin-panel.css";
import "./vendor-overrides.css";

const root = document.getElementById("root");

ReactDOM.createRoot(root).render(
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>,
);
