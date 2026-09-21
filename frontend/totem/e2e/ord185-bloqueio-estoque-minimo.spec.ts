import { expect, test } from "@playwright/test";
import { CatalogApi } from "./api-helper";
import { loginComPin } from "./login-helper";

// A4 (ORD-185) — bloqueio automático no totem por estoque mínimo. Roda
// contra o docker compose local de verdade (não mocka a API): o
// gateway/backend precisam estar de pé em localhost:8000 e o totem servido
// via `npm run dev` (localhost:5173, proxy pro gateway — ver vite.config.mts).
//
// PIN da Burger House (company_id=1) neste ambiente local — não é o mesmo
// PIN documentado no CLAUDE.md/seed original; foi regenerado numa sessão
// anterior via POST /companies/1/regenerate-pin e nunca mais mudou.
const PIN = "447052";
const TERMINAL_LABEL = "Totem 1 - Entrada";
const CATEGORIA_LANCHES_ID = 1;

// reload() preserva o token (localStorage), mas não a navegação em memória —
// volta pra WelcomeScreen (tela ociosa), achado ao rodar este teste pela 1ª
// vez. É o comportamento real de kiosk (idle-first), não um bug: replicar
// aqui o toque que o cliente daria de verdade.
async function reabrirCatalogoLanches(page: import("@playwright/test").Page): Promise<void> {
  await page.reload();
  await page.getByText("Toque para começar").click();
  await page.getByRole("radio", { name: "Lanches" }).click();
  // espera a grade real (não o skeleton de loading) antes de qualquer
  // asserção — sem isso a asserção de ausência passa "por sorte" durante o
  // próprio loading, e o screenshot de evidência fica só com skeletons.
  await expect(page.getByText("Classic Cheddar Burger")).toBeVisible({ timeout: 10_000 });
}

test("produto some do totem ao bater o estoque mínimo e reaparece após nova entrada", async ({ page }) => {
  const api = await CatalogApi.create(1);
  const productName = `E2E ORD-185 ${Date.now()}`;
  const product = await api.createProduct({
    name: productName,
    categoryId: CATEGORIA_LANCHES_ID,
    estoqueMinimo: 3,
  });

  try {
    await test.step("estoque inicial acima do mínimo (10 > 3)", async () => {
      await api.entrada(product.id, 10);
    });

    await test.step("login no totem e navega até Lanches", async () => {
      await loginComPin(page, PIN, TERMINAL_LABEL);
      await page.getByRole("radio", { name: "Lanches" }).click();
    });

    await test.step("produto visível com estoque acima do mínimo", async () => {
      await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 });
      await page.getByText(productName).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("01-produto-visivel.png") });
    });

    await test.step("ajuste derruba estoque pra igual ao mínimo (10 -> 3) — some do totem", async () => {
      await api.ajuste(product.id, -7, "E2E ORD-185 — simula venda/perda até bater o mínimo");
      await reabrirCatalogoLanches(page);
      await expect(page.getByText(productName)).not.toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: test.info().outputPath("02-produto-escondido.png") });
    });

    await test.step("nova entrada traz de volta acima do mínimo (3 -> 8) — reaparece", async () => {
      await api.entrada(product.id, 5);
      await reabrirCatalogoLanches(page);
      await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 });
      await page.getByText(productName).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("03-produto-reaparece.png") });
    });
  } finally {
    await api.deleteProduct(product.id);
    await api.dispose();
  }
});
