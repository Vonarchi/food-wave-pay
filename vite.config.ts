import { readFileSync } from "fs";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

/** Embed manifest as a data URL so preview deployments with Vercel Deployment Protection don't 401 on /manifest.json. */
function inlineWebManifest(): Plugin {
  return {
    name: "inline-web-manifest",
    transformIndexHtml(html) {
      const manifestPath = path.resolve(process.cwd(), "public/manifest.json");
      const raw = readFileSync(manifestPath, "utf-8").trim();
      const href = `data:application/manifest+json;charset=utf-8,${encodeURIComponent(raw)}`;
      return html.replace(
        /<link rel="manifest" href="\/manifest\.json"[^>]*\/?>/,
        `<link rel="manifest" href="${href}" />`
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), inlineWebManifest()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    // Do not use manualChunks — custom splits caused vendor chunks to load React APIs (forwardRef) before/without a valid React instance in production.
    chunkSizeWarningLimit: 900,
  },
});
