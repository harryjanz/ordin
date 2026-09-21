// Helper de setup/teardown via API direta (não UI) pra testes E2E do totem.
//
// Login de owner via UI exige MFA (carlos@burgerhouse.com), o que tornaria o
// setup de dados de teste mais lento e frágil que o próprio fluxo sob teste.
// Em vez disso, mintamos um JWT com o mesmo JWT_SECRET dev usado pelos
// containers locais (services/shared/auth.py) — só funciona contra o stack
// local (.env de dev, nunca produção). Ver memória de projeto
// "catalog-service espera claim 'company', não 'company_id'": a cópia local
// de auth.py no catalog-service e no company-service lê a claim "company",
// diferente do resto dos serviços — os dois helpers abaixo já usam a claim
// certa.
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { request as playwrightRequest } from "@playwright/test";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const GATEWAY_URL = "http://localhost:8000";

function readJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const envPath = path.join(REPO_ROOT, ".env");
  const raw = fs.readFileSync(envPath, "utf-8");
  const match = raw.match(/^JWT_SECRET=(.+)$/m);
  if (!match) throw new Error(".env não tem JWT_SECRET — necessário pro setup de teste E2E");
  return match[1].trim();
}

function mintOwnerToken(companyId: number): string {
  // sub precisa ser um id de usuário numérico de verdade — StockMovement.criado_por
  // é FK/coluna inteira, não aceita string arbitrária (achado ao rodar este teste
  // pela 1ª vez: "Incorrect integer value: 'e2e-owner' for column 'criado_por'").
  // "2" é o owner seed da Burger House (carlos@burgerhouse.com, ver init.sql).
  return jwt.sign(
    { sub: "2", company: companyId, role: "owner" },
    readJwtSecret(),
    { expiresIn: "10m" },
  );
}

export interface TestProduct {
  id: number;
  name: string;
}

export class CatalogApi {
  private constructor(private readonly ctx: Awaited<ReturnType<typeof playwrightRequest.newContext>>) {}

  static async create(companyId = 1): Promise<CatalogApi> {
    const ctx = await playwrightRequest.newContext({
      baseURL: GATEWAY_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${mintOwnerToken(companyId)}` },
    });
    return new CatalogApi(ctx);
  }

  async createProduct(opts: { name: string; categoryId: number; estoqueMinimo: number }): Promise<TestProduct> {
    const res = await this.ctx.post("/catalog/products", {
      data: { name: opts.name, price: 9.9, category_id: opts.categoryId, estoque_minimo: opts.estoqueMinimo },
    });
    if (!res.ok()) throw new Error(`criar produto falhou: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return { id: body.id, name: body.name };
  }

  async entrada(productId: number, quantidade: number): Promise<void> {
    const res = await this.ctx.post(`/catalog/products/${productId}/stock/movements`, {
      data: { tipo: "entrada", quantidade, unidade: "un" },
    });
    if (!res.ok()) throw new Error(`entrada de estoque falhou: ${res.status()} ${await res.text()}`);
  }

  async ajuste(productId: number, delta: number, motivo: string): Promise<void> {
    const res = await this.ctx.post(`/catalog/products/${productId}/stock/movements`, {
      data: { tipo: "ajuste", quantidade: delta, motivo },
    });
    if (!res.ok()) throw new Error(`ajuste de estoque falhou: ${res.status()} ${await res.text()}`);
  }

  async deleteProduct(productId: number): Promise<void> {
    // permanent=true — sem isso o DELETE só desativa (active=False,
    // reversível) e o produto de teste continua poluindo pra sempre a lista
    // de produtos do admin, mesmo fora do totem. Achado ao rodar este teste
    // pela 1ª vez: uma sessão interrompida no meio deixou 5 produtos "E2E
    // ORD-185 ..." órfãos, ainda visíveis em include_inactive=true.
    // best-effort — teardown não deve derrubar o teste se já foi limpo.
    await this.ctx.delete(`/catalog/products/${productId}`, { params: { permanent: "true" } }).catch(() => undefined);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}
