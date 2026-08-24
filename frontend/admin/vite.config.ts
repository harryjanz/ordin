/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // "design-system" é consumido via dependência `file:` — o caminho real
    // (depois de resolver o symlink que o npm cria) não passa por
    // node_modules/, então o plugin de CJS do Rollup não detecta os exports
    // nomeados por padrão. Força o tratamento explícito.
    commonjsOptions: {
      include: [/design-system/, /node_modules/],
    },
  },
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
      // ORD-093: mesmo caso de /companies — rota de API e de página do SPA
      // (PlatformUsersScreen) ao mesmo tempo.
      "/platform-users": {
        target: "http://localhost:8000",
        bypass(req) {
          if (req.headers["sec-fetch-dest"] === "document") return req.url;
        },
      },
      // ORD-119 — primeiro cliente WebSocket do admin (FulfillmentScreen).
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
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
