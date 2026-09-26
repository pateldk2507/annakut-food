import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ["icons-frequencies-printed-declined.trycloudflare.com","annakut.bapstbay.org"],
    proxy: {
      "/api": "http://localhost:3001",
      "/assets": "http://localhost:3001",
    },
  },
});
