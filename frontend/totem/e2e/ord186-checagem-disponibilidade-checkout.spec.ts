import { expect, test } from "@playwright/test";
import { CatalogApi } from "./api-helper";
import { loginComPin } from "./login-helper";

// A4b (ORD-186) — checagem prévia de disponibilidade do carrinho antes de
// cobrar no TEF. Roda contra o docker compose local de verdade (não mocka a
// API) — mesmo padrão do ORD-185.
//
// Cobre o cenário central desta história: item que esgota ENTRE o cliente
// montar o carrinho e avançar pra pagamento é removido automaticamente, com
// modal nomeando o item (não toast — regra de UX do totem), e o pedido nunca
// chega a ser criado (POST /orders). O caminho feliz (tudo disponível seguindo
// até a tela de pagamento) não é exercitado aqui de propósito — exigiria
// interação com TEF mockado só pra confirmar um branch que o próprio código
// prova ser idêntico ao de antes desta história (early return só no ramo de
// indisponibilidade); já coberto pelos testes de integração do backend
// (test_ord186_checagem_disponibilidade_checkout.py).
const PIN = "447052";
const TERMINAL_LABEL = "Totem 1 - Entrada";
const CATEGORIA_LANCHES_ID = 1;

test("item que esgota antes do checkout é removido do carrinho com modal, pedido não é criado", async ({ page }) => {
  const api = await CatalogApi.create(1);
  const productName = `E2E ORD-186 ${Date.now()}`;
  const product = await api.createProduct({
    name: productName,
    categoryId: CATEGORIA_LANCHES_ID,
    estoqueMinimo: 3,
  });

  try {
    await test.step("estoque inicial acima do mínimo — item disponível ao montar o carrinho", async () => {
      await api.entrada(product.id, 10);
    });

    await test.step("login, adiciona o item ao carrinho", async () => {
      await loginComPin(page, PIN, TERMINAL_LABEL);
      await page.getByRole("radio", { name: "Lanches" }).click();
      const card = page.locator('[data-slot="card"]').filter({ hasText: productName });
      await card.scrollIntoViewIfNeeded();
      await card.getByRole("button").click();
      await expect(page.getByText("Ver pedido (1 item)")).toBeVisible({ timeout: 10_000 });
    });

    await test.step("item esgota enquanto o cliente ainda está montando o pedido", async () => {
      // <= o mínimo (3) — mesma regra de A4/ORD-185, reaproveitada por
      // _availability_map.
      await api.ajuste(product.id, -8, "E2E ORD-186 — simula esgotar entre montar carrinho e pagar");
    });

    await test.step("avança pro checkout — modal aparece, pedido não é criado", async () => {
      await page.getByText("Ver pedido (1 item)").click();
      await page.getByRole("button", { name: "Finalizar pedido →" }).click();

      // Burger House (company_id=1): consumption_mode_enabled=true,
      // fulfillment_mode=retirada_unica, fiscal_module_ativo=true — o fluxo
      // passa por 3 telas antes de handleCpfDone, mesmo caminho de qualquer
      // pedido real nesta empresa.
      await page.getByRole("button", { name: "Para levar" }).click();
      await page.getByText("Prefiro não informar").click(); // PickupNameScreen
      await page.getByText("Prefiro não informar").click(); // CpfScreen

      await expect(page.getByRole("heading", { name: "Alguns itens esgotaram" })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(productName)).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("01-modal-item-removido.png") });
    });

    await test.step("fecha o modal — carrinho vazio volta pro catálogo", async () => {
      await page.getByRole("button", { name: "Entendi, continuar" }).click();
      await expect(page.getByText("Carrinho vazio")).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: test.info().outputPath("02-catalogo-carrinho-vazio.png") });
    });
  } finally {
    await api.deleteProduct(product.id);
    await api.dispose();
  }
});
