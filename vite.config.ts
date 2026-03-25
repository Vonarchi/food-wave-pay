import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("react-router"))
            return "react-vendor";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("recharts") || id.includes("framer-motion")) return "charts-motion";
          if (id.includes("@radix-ui")) return "radix-ui";
          return "vendor";
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
