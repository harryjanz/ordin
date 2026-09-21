// Fluxo real de login do totem: pareamento (pulado via "Entrar com PIN") →
// PIN de 6 dígitos → seleção de terminal → teste de TEF (mock, ~R$0,01
// cancelado) → catálogo. Não pula nenhuma etapa via localStorage/token
// injetado — o objetivo do E2E é exercitar a UI de verdade.
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function loginComPin(page: Page, pin: string, terminalLabel: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar com PIN" }).click();

  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }

  await expect(page.getByText(terminalLabel)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: new RegExp(terminalLabel) }).click();

  // Etapa de teste de TEF mockado — sucesso avança sozinho após ~1.8s.
  await expect(page.getByText("Máquina OK!")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Toque para começar")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Toque para começar").click();
}
