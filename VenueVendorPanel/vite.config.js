import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));

const server = {
  host: true,
  port: 5174,
  strictPort: true,
};

function safariHtmlPlugin() {
  return {
    name: "safari-html",
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin /g, "<script type=\"module\" ")
        .replace(/<link rel="stylesheet" crossorigin /g, "<link rel=\"stylesheet\" ")
        .replace(/<link rel="modulepreload"[^>]*>/g, "");
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Production build is deployed under /vendor/ on the same domain as the admin panel.
  base: mode === "production" ? "/vendor/" : "/",
  plugins: [react(), safariHtmlPlugin()],
  build: {
    target: ["es2019", "safari13"],
    cssTarget: "safari13",
  },
  server: {
    ...server,
    // main.jsx imports ../../AdminPannel/src/admin-panel.css
    fs: { allow: [path.resolve(root, "..")] },
  },
  preview: server,
}));
