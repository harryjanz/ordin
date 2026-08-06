import { defineConfig, devices } from "@playwright/test";

// Evidências (screenshots/vídeos/traces) vão para docs/stories/<ORD_ID>/evidencias/e2e/
// dentro do repositório — nunca em diretório temporário fora do projeto.
// Ver docs/roles/qa.md e docs/WORKFLOW.md.
const ordId = process.env.ORD_ID ?? "ORD-060";
const outputDir = `../../docs/stories/${ordId}/evidencias/e2e`;

export default defineConfig({
  testDir: "./e2e",
  outputDir,
  fullyParallel: false,
  // fullyParallel:false só serializa os testes DENTRO de um arquivo — com
  // mais de um spec (ORD-060/062/063), o Playwright ainda distribuía cada
  // arquivo pra um worker diferente, e logins concorrentes com o mesmo
  // usuário (admin@ordin.app) contra o backend real derrubavam uns aos
  // outros. workers:1 força a suíte inteira a rodar em série.
  workers: 1,
  retries: 0,
  reporter: [["html", { outputFolder: `../../docs/stories/${ordId}/evidencias/e2e-report`, open: "never" }]],
  use: {
    baseURL: "http://localhost:5174",
    screenshot: "on",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
