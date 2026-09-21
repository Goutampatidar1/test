import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig({
  plugins: [react(), safariHtmlPlugin()],
  build: {
    target: ["es2019", "safari13"],
    cssTarget: "safari13",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/ckeditor5") || id.includes("node_modules/@ckeditor")) return "ckeditor";
          if (id.includes("node_modules/swiper")) return "swiper";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ["**/*.zip", "**/dist/**", "**/node_modules/**"],
    },
  },
});
