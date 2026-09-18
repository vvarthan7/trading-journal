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
      // The FastAPI broker proxy in backend/. A deployed build talks to it directly instead,
      // via VITE_API_BASE, since this proxy only exists under `npm run dev`.
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
