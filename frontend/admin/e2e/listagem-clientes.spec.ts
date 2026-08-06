import { expect, test } from "@playwright/test";
import { extractCompanyId, recordTestCompany } from "./test-data-manifest";

// Fluxo completo (ORD-062): login superadmin → cadastra um cliente com nome
// único (via wizard do ORD-060, reaproveitado só pra ter um registro
// determinístico pra filtrar) → Clientes → busca, filtro de status,
// navegação pro detalhe, estado vazio. Roda contra o docker compose local
// de verdade (não mocka a API).

const CNPJ_TESTE = "11222333000181";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function criarClienteViaWizard(page: import("@playwright/test").Page, tradeName: string): Promise<void> {
  await page.goto("/companies/new");
  await page.getByTestId("input-cnpj").fill(CNPJ_TESTE);
  await expect(page.getByTestId("lookup-ativa")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("input-trade-name").fill(tradeName);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click(); // passo 2 — endereço já preenchido
  await page.getByTestId("input-comercial-name").fill("Contato E2E Listagem");
  await page.getByTestId("input-comercial-email").fill("contato.e2e.listagem@example.com");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("input-rep-name").fill("Responsável E2E Listagem");
  await page.getByTestId("input-rep-cpf").fill("11144477735");
  await page.getByTestId("input-rep-email").fill("rep.e2e.listagem@example.com");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("btn-criar-cadastro").click();
  await expect(page.getByText("Cliente cadastrado com sucesso")).toBeVisible({ timeout: 10000 });
}

test("busca por nome, filtra por status e navega ao detalhe", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const tradeName = `Zzlist E2E ${uniqueSuffix}`;

  await login(page, "admin@ordin.app", "admin123");
  await criarClienteViaWizard(page, tradeName);

  await test.step("navega para Clientes e busca pelo nome único", async () => {
    await page.getByRole("button", { name: /abrir menu/i }).click();
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page).toHaveURL(/\/companies$/);
    await page.getByTestId("input-busca-nome").fill(tradeName);
    await expect(page.getByTestId("contador-resultados")).toContainText("1 cliente encontrado", { timeout: 10000 });
    await page.screenshot({ path: test.info().outputPath("01-busca-por-nome.png") });
  });

  await test.step("filtro de status pendente mantém o resultado", async () => {
    await page.getByTestId("select-filtro-status").selectOption("pendente");
    await expect(page.getByTestId("contador-resultados")).toContainText("1 cliente encontrado");
    await page.screenshot({ path: test.info().outputPath("02-filtro-status-pendente.png") });
  });

  await test.step("filtro de status assinado zera o resultado (estado vazio)", async () => {
    await page.getByTestId("select-filtro-status").selectOption("assinado");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("03-estado-vazio.png") });
  });

  await test.step("limpar filtros e navegar ao detalhe pela linha", async () => {
    await page.getByTestId("select-filtro-status").selectOption("");
    await page.getByTestId("input-busca-nome").fill(tradeName);
    await expect(page.getByTestId("contador-resultados")).toContainText("1 cliente encontrado");
    await page.getByText(tradeName).click();
    await expect(page).toHaveURL(/\/companies\/\d+\/contract/);
    await expect(page.getByRole("heading", { name: tradeName })).toBeVisible();
    recordTestCompany({
      id: extractCompanyId(page.url()), document: CNPJ_TESTE,
      name: tradeName, specFile: "listagem-clientes.spec.ts",
    });
    await page.screenshot({ path: test.info().outputPath("04-navegou-ao-detalhe.png") });
  });
});

test("filtro por CNPJ mascarado encontra o cliente", async ({ page }) => {
  await login(page, "admin@ordin.app", "admin123");
  await page.goto("/companies");
  await page.getByTestId("input-filtro-cnpj").fill(CNPJ_TESTE);
  await expect(page.getByTestId("contador-resultados")).toBeVisible({ timeout: 10000 });
  const count = await page.getByTestId("contador-resultados").textContent();
  expect(count).toMatch(/\d+ clientes? encontrados?/);
  await page.screenshot({ path: test.info().outputPath("filtro-cnpj.png") });
});

test("digitar CNPJ dígito por dígito não zera a lista antes de completar", async ({ page }) => {
  // Regressão: o backend faz match EXATO de CNPJ — digitar de verdade
  // (tecla por tecla, diferente de .fill() que seta o valor final de uma
  // vez) disparava uma busca a cada dígito parcial, sempre 0 resultados,
  // fazendo a lista piscar vazia/"carregando" até o CNPJ ficar completo.
  await login(page, "admin@ordin.app", "admin123");
  await page.goto("/companies");
  await expect(page.getByTestId("contador-resultados")).toBeVisible({ timeout: 10000 });

  const cnpjField = page.getByTestId("input-filtro-cnpj");
  await cnpjField.pressSequentially(CNPJ_TESTE.slice(0, 6), { delay: 120 });
  // com o CNPJ ainda incompleto, nem a tabela nem o contador podem sumir
  await expect(page.getByTestId("empty-state")).not.toBeVisible();
  await expect(page.locator('[data-testid^="row-company-"]').first()).toBeVisible();

  await cnpjField.pressSequentially(CNPJ_TESTE.slice(6), { delay: 120 });
  await expect(page.getByTestId("contador-resultados")).toContainText(/\d+ clientes? encontrados?/, { timeout: 10000 });
  await expect(page.locator('[data-testid^="row-company-"]').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("cnpj-digitado-tecla-por-tecla.png") });
});

test("digitação rápida (colar/autofill) não perde o valor do campo de CNPJ", async ({ page }) => {
  // Regressão: o campo de CNPJ tem o value derivado de formatCnpj(document)
  // recalculado a cada render — sob digitação MUITO rápida (delay 0, o mais
  // próximo de um paste/autofill real), o valor do campo às vezes ficava
  // vazio mesmo depois de "digitado" tudo, mesmo com o request-id guard e o
  // debounce compartilhado com a busca por nome. A máscara em si (pontuação
  // ao vivo) é mantida deliberadamente — pedido explícito do usuário — então
  // a asserção aqui é sobre o valor MASCARADO persistir, não o valor cru.
  await login(page, "admin@ordin.app", "admin123");
  await page.goto("/companies");
  await expect(page.getByTestId("contador-resultados")).toBeVisible({ timeout: 10000 });

  const cnpjField = page.getByTestId("input-filtro-cnpj");
  await cnpjField.pressSequentially(CNPJ_TESTE, { delay: 0 });
  await expect(cnpjField).toHaveValue("11.222.333/0001-81");
});

test("busca sem correspondência mostra estado vazio com opção de limpar", async ({ page }) => {
  await login(page, "admin@ordin.app", "admin123");
  await page.goto("/companies");
  await page.getByTestId("input-busca-nome").fill("NomeQueDefinitivamenteNaoExisteZZZ999");
  await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByTestId("input-busca-nome")).toHaveValue("");
  await page.screenshot({ path: test.info().outputPath("busca-sem-correspondencia.png") });
});

test("menu Clientes não aparece para role owner", async ({ page }) => {
  await login(page, "carlos@burgerhouse.com", "burger123");
  await page.getByRole("button", { name: /abrir menu/i }).click();
  await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("menu-sem-clientes-owner.png") });
});
