import path from "node:path";
import { expect, test } from "@playwright/test";
import { extractCompanyId, recordTestCompany } from "./test-data-manifest";
import { selectDropdownOption } from "./dropdown-helper";

// Fluxo completo (ORD-060): login superadmin → wizard de 5 passos → criar →
// detalhe do cliente → marcar contrato enviado → marcar assinado com upload.
// Roda contra o docker compose local de verdade (não mocka a API).

const CNPJ_TESTE = "11222333000181"; // CNPJ real, válido — usado nos testes de backend (ORD-056/057)

test("cadastro de cliente ponta a ponta", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  await test.step("login como super admin", async () => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("admin@ordin.app");
    await page.getByLabel("Senha").fill("admin123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.screenshot({ path: test.info().outputPath("01-login-ok.png") });
  });

  await test.step("navega para novo cliente", async () => {
    await page.getByRole("button", { name: /abrir menu/i }).click();
    await page.getByRole("link", { name: "Novo cliente" }).click();
    await expect(page).toHaveURL(/\/companies\/new/);
    await page.screenshot({ path: test.info().outputPath("02-wizard-passo1.png") });
  });

  await test.step("passo 1 — dados cadastrais com consulta real de CNPJ", async () => {
    await page.getByTestId("input-cnpj").fill(CNPJ_TESTE);
    await expect(page.getByTestId("lookup-ativa")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("input-trade-name").fill(`Sabor Caseiro E2E ${uniqueSuffix}`);
    await page.screenshot({ path: test.info().outputPath("03-cnpj-consultado.png") });
    await page.getByRole("button", { name: "Continuar" }).click();
  });

  await test.step("passo 2 — endereço autopreenchido", async () => {
    await expect(page.getByRole("heading", { name: "Endereço" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("04-endereco.png") });
    await page.getByRole("button", { name: "Continuar" }).click();
  });

  await test.step("passo 3 — contato comercial obrigatório", async () => {
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Nome do contato comercial é obrigatório")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("05-contato-obrigatorio.png") });

    await page.getByTestId("input-comercial-name").fill("Maria Silva E2E");
    await page.getByTestId("input-comercial-email").fill("maria.e2e@saborcaseiro.com.br");
    await page.getByRole("button", { name: "Continuar" }).click();
  });

  await test.step("passo 4 — responsável legal com CPF válido", async () => {
    await page.getByTestId("input-rep-name").fill("Carlos Mendes E2E");
    await page.getByTestId("input-rep-cpf").fill("11144477735");
    await page.getByTestId("input-rep-email").fill("carlos.e2e@saborcaseiro.com.br");
    await page.screenshot({ path: test.info().outputPath("06-responsavel-legal.png") });
    await page.getByRole("button", { name: "Continuar" }).click();
  });

  let companyUrl = "";
  await test.step("passo 5 — revisão e criação", async () => {
    await expect(page.getByRole("heading", { name: "Revisão" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("07-revisao.png") });
    await page.getByTestId("btn-criar-cadastro").click();
    await expect(page.getByText("Cliente cadastrado com sucesso")).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: test.info().outputPath("08-cadastro-criado.png") });
    await page.getByRole("button", { name: "Ver detalhe e status do contrato" }).click();
    await expect(page).toHaveURL(/\/companies\/\d+\/contract/);
    companyUrl = page.url();
    recordTestCompany({
      id: extractCompanyId(companyUrl), document: CNPJ_TESTE,
      name: `Sabor Caseiro E2E ${uniqueSuffix}`, specFile: "cadastro-cliente.spec.ts",
    });
  });

  await test.step("marca contrato como enviado", async () => {
    await page.getByTestId("btn-marcar-enviado").click();
    await expect(page.getByText("CONTRATO: ENVIADO")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("09-contrato-enviado.png") });
  });

  await test.step("anexa PDF e marca como assinado", async () => {
    await page.getByTestId("input-signed-document").setInputFiles(
      path.join(__dirname, "fixtures", "contrato-assinado.pdf")
    );
    await expect(page.getByTestId("btn-marcar-assinado")).toBeEnabled();
    await page.getByTestId("btn-marcar-assinado").click();
    await expect(page.getByText("CONTRATO: ASSINADO")).toBeVisible();
    await expect(page.getByText("Contrato assinado — documento arquivado.")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("10-contrato-assinado.png") });
  });

  expect(companyUrl).toMatch(/\/companies\/\d+\/contract/);
});

test("CNPJ com formato inválido bloqueia avanço do passo 1", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("admin@ordin.app");
  await page.getByLabel("Senha").fill("admin123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/companies/new");

  await page.getByTestId("input-cnpj").fill("123456");
  await page.getByTestId("input-trade-name").fill("Empresa Teste");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("CNPJ inválido (formato ou dígito verificador)")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("cnpj-invalido-bloqueado.png") });
});

test("cadastro com CNPJ alfanumérico completa sem bloquear (ORD-064)", async ({ page }) => {
  // Vetor oficial SERPRO (12ABC34501DE + DV 35) — não é uma empresa real,
  // então nenhum provedor de consulta vai confirmar. O ponto do teste é
  // justamente esse: mesmo sem confirmação, o cadastro não pode travar
  // (Gap 2/3 do ORD-064) e a máscara precisa pontuar corretamente com letras.
  const CNPJ_ALFA = "12ABC34501DE35";
  const uniqueSuffix = Date.now().toString().slice(-6);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill("admin@ordin.app");
  await page.getByLabel("Senha").fill("admin123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/companies/new");

  await test.step("máscara pontua corretamente com letras", async () => {
    await page.getByTestId("input-cnpj").fill(CNPJ_ALFA);
    await expect(page.getByTestId("input-cnpj")).toHaveValue("12.ABC.345/01DE-35");
    await page.screenshot({ path: test.info().outputPath("01-cnpj-alfa-mascarado.png") });
  });

  await test.step("nenhum estado bloqueante aparece — ATIVA real ou local", async () => {
    await expect(page.getByTestId("lookup-nao-encontrado")).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("lookup-ativa").or(page.getByTestId("lookup-ativa-local"))).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: test.info().outputPath("02-cnpj-alfa-nao-bloqueado.png") });
  });

  await page.getByTestId("input-trade-name").fill(`Alfa E2E ${uniqueSuffix}`);
  // CNPJ fictício não é encontrado por nenhum provedor, então razão social
  // também não vem auto-preenchida (diferente do teste com CNPJ real desta
  // mesma suíte) — preenche manualmente.
  await page.getByTestId("input-legal-name").fill(`Alfa E2E ${uniqueSuffix} Ltda`);
  await page.getByRole("button", { name: "Continuar" }).click();

  // Passo 2 — CNPJ fictício (vetor oficial, não é empresa real), nenhum
  // provedor confirma, então o endereço NÃO vem auto-preenchido — diferente
  // do outro teste desta suíte, que usa um CNPJ que corresponde a uma
  // entidade real. Preenche manualmente.
  await page.getByTestId("input-street").fill("Rua Alfanumérica");
  await page.getByTestId("input-address-number").fill("35");
  await page.getByTestId("input-neighborhood").fill("Centro");
  await page.getByTestId("input-city").fill("São Paulo");
  await selectDropdownOption(page, "input-state", "SP");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("input-comercial-name").fill("Contato Alfa E2E");
  await page.getByTestId("input-comercial-email").fill("contato.alfa.e2e@example.com");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("input-rep-name").fill("Responsável Alfa E2E");
  await page.getByTestId("input-rep-cpf").fill("11144477735");
  await page.getByTestId("input-rep-email").fill("rep.alfa.e2e@example.com");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByTestId("btn-criar-cadastro").click();
  await expect(page.getByText("Cliente cadastrado com sucesso")).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: test.info().outputPath("03-cnpj-alfa-cadastrado.png") });

  await page.getByRole("button", { name: "Ver detalhe e status do contrato" }).click();
  await expect(page).toHaveURL(/\/companies\/\d+\/contract/);
  recordTestCompany({
    id: extractCompanyId(page.url()), document: CNPJ_ALFA,
    name: `Alfa E2E ${uniqueSuffix}`, specFile: "cadastro-cliente.spec.ts",
  });
});

test("menu Empresas não aparece para role owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("carlos@burgerhouse.com");
  await page.getByLabel("Senha").fill("burger123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: /abrir menu/i }).click();
  await expect(page.getByRole("link", { name: "Novo cliente" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("menu-sem-novo-cliente-owner.png") });
});
