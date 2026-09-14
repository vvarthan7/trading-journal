import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/trading-journal/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // phase 2: point the app at the FastAPI backend without CORS headaches
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
