import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // ORD-121 — mesmo motivo do admin: "design-system" é consumido via
    // dependência `file:`, o Rollup não detecta os exports nomeados sem
    // isso.
    commonjsOptions: {
      include: [/design-system/, /node_modules/],
    },
  },
  server: {
    port: 5175,
    proxy: {
      "/auth":    "http://localhost:8000",
      "/users":   "http://localhost:8000",
      "/orders":  "http://localhost:8000",
      "/tickets": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});
