/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/auth": "http://localhost:8000",
      "/catalog": "http://localhost:8000",
      "/orders": "http://localhost:8000",
      "/tickets": "http://localhost:8000",
      "/payments": "http://localhost:8000",
      "/companies": {
        target: "http://localhost:8000",
        // "/companies", "/companies/new" e "/companies/{id}/contract" são
        // rotas do SPA (ORD-060/062), não só da API — um reload ou acesso
        // direto por URL nessas rotas precisa servir o index.html do React
        // Router, não bater no backend. O sinal confiável não é o path (a
        // própria API expõe GET/POST /companies), é o Fetch Metadata: uma
        // navegação de página real chega com sec-fetch-dest: document; uma
        // chamada XHR/fetch do axios da própria SPA não.
        bypass(req) {
          if (req.headers["sec-fetch-dest"] === "document") return req.url;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
