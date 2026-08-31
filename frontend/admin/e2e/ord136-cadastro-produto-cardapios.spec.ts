import { expect, test } from "@playwright/test";
import crypto from "crypto";

// ORD-136: edição de produto e criação/edição de cardápio saem do modal e
// ganham tela dedicada; composição de cardápio troca CheckboxMultiselect
// por busca + dropdown (SearchMultiSelect). Roda contra o docker compose
// local de verdade (não mocka a API) — empresa Burger House (seed).
//
// Usa ana@burgerhouse.com em vez do owner documentado no CLAUDE.md
// (carlos@burgerhouse.com) porque exercitar o fluxo completo de setup de
// MFA obrigatório (ORD-096) a cada run — QR code, confirmação, tela de
// backup codes — não é o que esta história testa. Dependência local: essa
// conta precisa ter senha "test1234" e TOTP já habilitado com o secret
// abaixo (setup feito uma vez via UI real, não reproduzido aqui). Se rodar
// contra uma seed nova, refaça esse setup manualmente uma vez antes.

function totp(secretB32: string): string {
  const clean = secretB32.replace(/=+$/, "").toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of clean) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{1,8}/g)!.filter((b) => b.length === 8).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hmac = crypto.createHmac("sha1", bytes).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

const ANA_TOTP_SECRET = "JYDO4CPA4TC5MCHXIKZFCR5I2L3NQPW2";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("ana@burgerhouse.com");
  await page.getByLabel("Senha").fill("test1234");
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.getByLabel("Código", { exact: true }).fill(totp(ANA_TOTP_SECRET));
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test("editar produto abre em tela dedicada, não em modal", async ({ page }) => {
  await login(page);
  await page.goto("/catalog");
  await page.getByRole("tab", { name: /Produtos/i }).click();

  const firstEditButton = page.getByRole("button", { name: "Editar" }).first();
  await expect(firstEditButton).toBeVisible({ timeout: 10000 });
  await firstEditButton.click();

  await expect(page).toHaveURL(/\/catalog\/products\/\d+\/edit/);
  await expect(page.getByText("Editando produto")).toBeVisible();
  // Campos do formulário pesado, que antes só existiam dentro do modal.
  await expect(page.getByText("Descrição curta")).toBeVisible();
  await expect(page.getByText("Alérgenos (RDC 727/2022)")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("01-produto-tela-dedicada.png") });

  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/catalog\?tab=products/);
});

test("criar produto continua no modal, sem navegar", async ({ page }) => {
  await login(page);
  await page.goto("/catalog");
  await page.getByRole("tab", { name: /Produtos/i }).click();

  await page.getByRole("button", { name: "+ Novo produto" }).click();
  await expect(page.getByTestId("modal-backdrop").getByText("Novo produto")).toBeVisible();
  await expect(page).toHaveURL(/\/catalog$/); // não navegou
  await page.screenshot({ path: test.info().outputPath("02-produto-criacao-modal.png") });
});

test("criar cardápio em tela dedicada, compor com busca + dropdown", async ({ page }) => {
  await login(page);
  await page.goto("/catalog");
  await page.getByRole("tab", { name: /Cardápios/i }).click();

  await page.getByRole("button", { name: "+ Novo cardápio" }).click();
  await expect(page).toHaveURL(/\/catalog\/menus\/new/);
  await expect(page.getByText("Novo cardápio")).toBeVisible();
  await page.waitForLoadState("networkidle");

  // InputBase do design system não expõe o <label> associado via aria (o
  // texto do label fica solto ao lado do input; a accessible name real é o
  // placeholder) — getByLabel não funciona aqui mesmo com o label visível.
  const uniqueName = `E2E Cardápio ${Date.now().toString().slice(-6)}`;
  await page.getByPlaceholder("ex: Café da manhã").fill(uniqueName, { timeout: 15000 });
  const timeInputs = page.locator('input[type="time"]');
  await timeInputs.nth(0).fill("08:00");
  await timeInputs.nth(1).fill("11:00");
  // CheckboxMultiselect é um combobox fechado por padrão — precisa abrir
  // antes de marcar uma opção.
  await page.getByText("Dias da semana").click({ force: true });
  await page.getByText("Seg", { exact: true }).click();

  // Composição via busca + dropdown (SearchMultiSelect) — categorias.
  await page.getByPlaceholder("Filtrar por nome…").first().fill("Lanches");
  await page.getByPlaceholder("Selecionar…").first().click();
  await page.getByRole("button", { name: /Lanches/i }).first().click();
  await expect(page.getByText("Lanches", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("03-cardapio-composicao-busca.png") });

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/catalog\?tab=menus/, { timeout: 10000 });
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: test.info().outputPath("04-cardapio-criado-listagem.png") });
});

test("editar cardápio existente abre em tela dedicada", async ({ page }) => {
  await login(page);
  await page.goto("/catalog");
  await page.getByRole("tab", { name: /Cardápios/i }).click();

  const firstEditButton = page.getByRole("button", { name: "Editar" }).first();
  await expect(firstEditButton).toBeVisible({ timeout: 10000 });
  await firstEditButton.click();

  await expect(page).toHaveURL(/\/catalog\/menus\/\d+\/edit/);
  await expect(page.getByText("Editar cardápio")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("05-cardapio-edicao-tela-dedicada.png") });
});
