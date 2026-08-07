import { expect, test } from "@playwright/test";
import { extractCompanyId, hardDeleteImmediately, recordTestCompany } from "./test-data-manifest";
import { selectDropdownOption } from "./dropdown-helper";

// Fluxo completo (ORD-063): login superadmin → cadastra um cliente (via
// wizard do ORD-060, só pra ter um registro determinístico) → abre o
// detalhe → edita cadastro → salva → confirma persistência. Também cobre
// descartar e o guard de navegação com alterações pendentes. Roda contra o
// docker compose local de verdade (não mocka a API).
//
// Todos os testes deste arquivo reusam o mesmo CNPJ_TESTE (precisa ser um
// CNPJ real pra consulta à Receita auto-preencher) — desde o ORD-065,
// companies.document é UNIQUE, então cada teste apaga a própria empresa
// logo no afterEach, liberando o CNPJ pro próximo teste do arquivo.

const CNPJ_TESTE = "11222333000181";
let lastCreatedCompanyId: number | null = null;

test.afterEach(() => {
  if (lastCreatedCompanyId !== null) {
    hardDeleteImmediately(lastCreatedCompanyId);
    lastCreatedCompanyId = null;
  }
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function criarClienteEAbrirDetalhe(page: import("@playwright/test").Page, tradeName: string): Promise<void> {
  await page.goto("/companies/new");
  await page.getByTestId("input-cnpj").fill(CNPJ_TESTE);
  await expect(page.getByTestId("lookup-ativa")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("input-trade-name").fill(tradeName);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("input-comercial-name").fill("Contato E2E Edição");
  await page.getByTestId("input-comercial-email").fill("contato.e2e.edicao@example.com");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("input-rep-name").fill("Responsável E2E Edição");
  await page.getByTestId("input-rep-cpf").fill("11144477735");
  await page.getByTestId("input-rep-email").fill("rep.e2e.edicao@example.com");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("btn-criar-cadastro").click();
  await expect(page.getByText("Cliente cadastrado com sucesso")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Ver detalhe e status do contrato" }).click();
  await expect(page).toHaveURL(/\/companies\/\d+\/contract/);
  const id = extractCompanyId(page.url());
  recordTestCompany({ id, document: CNPJ_TESTE, name: tradeName, specFile: "edicao-cadastro-cliente.spec.ts" });
  lastCreatedCompanyId = id;
}

test("editar cadastro, salvar e confirmar persistência", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const tradeName = `Zzedit E2E ${uniqueSuffix}`;

  await login(page, "admin@ordin.app", "admin123");
  await criarClienteEAbrirDetalhe(page, tradeName);

  await test.step("entrar no modo edição sem alterar nada e descartar", async () => {
    await page.getByTestId("btn-editar-cadastro").click();
    await expect(page.getByTestId("input-edit-trade-name")).toHaveValue(tradeName);
    await expect(page.getByTestId("input-edit-cnpj")).toBeDisabled();
    await page.getByTestId("btn-descartar-edicao").click();
    await expect(page.getByTestId("btn-editar-cadastro")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("01-entrou-e-descartou-sem-alterar.png") });
  });

  await test.step("editar razão social e cidade, salvar e ver refletido no modo leitura", async () => {
    await page.getByTestId("btn-editar-cadastro").click();
    await page.getByTestId("input-edit-legal-name").fill(`${tradeName} Comércio de Alimentos Ltda`);
    await selectDropdownOption(page, "select-edit-company-size", "EPP");
    await expect(page.getByTestId("dirty-count")).toContainText("2 campos alterados");
    await page.screenshot({ path: test.info().outputPath("02-campos-alterados.png") });

    await page.getByTestId("btn-salvar-edicao").click();
    await expect(page.getByTestId("btn-editar-cadastro")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`${tradeName} Comércio de Alimentos Ltda`)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("03-salvo-modo-leitura.png") });

    await page.reload();
    await expect(page.getByText(`${tradeName} Comércio de Alimentos Ltda`)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("04-persistencia-confirmada-apos-reload.png") });
  });
});

test("descartar reverte o campo alterado", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const tradeName = `Zzedit E2E ${uniqueSuffix}`;

  await login(page, "admin@ordin.app", "admin123");
  await criarClienteEAbrirDetalhe(page, tradeName);

  await page.getByTestId("btn-editar-cadastro").click();
  await page.getByTestId("input-edit-trade-name").fill("Nome Temporário Que Não Deve Persistir");
  await expect(page.getByTestId("dirty-count")).toBeVisible();
  await page.getByTestId("btn-descartar-edicao").click();

  await expect(page.getByRole("heading", { name: tradeName })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("descartar-reverte.png") });
});

test("erro de validação aparece no campo, não como alerta genérico", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const tradeName = `Zzedit E2E ${uniqueSuffix}`;

  await login(page, "admin@ordin.app", "admin123");
  await criarClienteEAbrirDetalhe(page, tradeName);

  await page.getByTestId("btn-editar-cadastro").click();
  await page.getByTestId("input-edit-zip-code").fill("123");
  await page.getByTestId("btn-salvar-edicao").click();

  await expect(page.getByText("CEP inválido — deve conter 8 dígitos")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("erro-validacao-campo.png") });
});

test("navegar pelo menu com alterações pendentes pede confirmação", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const tradeName = `Zzedit E2E ${uniqueSuffix}`;

  await login(page, "admin@ordin.app", "admin123");
  await criarClienteEAbrirDetalhe(page, tradeName);

  await page.getByTestId("btn-editar-cadastro").click();
  await page.getByTestId("input-edit-legal-name").fill("Alteração Não Salva Ltda");

  await page.getByRole("button", { name: /abrir menu/i }).click();
  await page.getByRole("link", { name: "Dashboard" }).click();

  await expect(page.getByText(/alterações não salvas/i)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();

  // cancelar a confirmação cancelou a navegação — ainda na tela de edição com o valor digitado intacto
  await expect(page.getByTestId("input-edit-legal-name")).toHaveValue("Alteração Não Salva Ltda");
  await page.screenshot({ path: test.info().outputPath("guard-navegacao-cancelada.png") });
});

test("menu Empresas não expõe edição para role owner", async ({ page }) => {
  await login(page, "carlos@burgerhouse.com", "burger123");
  await page.getByRole("button", { name: /abrir menu/i }).click();
  await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Novo cliente" })).toHaveCount(0);
});
