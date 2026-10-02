import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Site institucional — sem backend, sem proxy de API (diferente de
// totem/admin/balcao). Só HTML/CSS/JS estático + link wa.me pro WhatsApp.
export default defineConfig({
  plugins: [react()],
});
