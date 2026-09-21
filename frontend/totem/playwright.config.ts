import { defineConfig, devices } from "@playwright/test";

// Evidências (screenshots/vídeos/traces) vão para docs/stories/<ORD_ID>/evidencias/
// dentro do repositório — nunca em diretório temporário fora do projeto.
// Ver docs/roles/qa.md e docs/WORKFLOW.md. Mesmo padrão do frontend/admin.
const ordId = process.env.ORD_ID ?? "ORD-185";
const outputDir = `../../docs/stories/${ordId}/evidencias/e2e`;

export default defineConfig({
  testDir: "./e2e",
  outputDir,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["html", { outputFolder: `../../docs/stories/${ordId}/evidencias/e2e-report`, open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "on",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
