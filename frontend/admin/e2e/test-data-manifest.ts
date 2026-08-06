// Marcação explícita de dados criados por testes E2E, pra permitir limpeza
// posterior com confirmação — nunca automática. Ver
// docs/stories/ORD-065-cnpj-unico-limpeza-teste.md e a memória de projeto
// "verificação ao vivo" sobre por que a base de dev acumulava dados de
// teste sem controle (2026-08-05).
//
// Uso: cada spec chama recordTestCompany() logo depois de criar uma empresa
// pelo wizard, com o id extraído da URL de redirecionamento. O manifesto é
// local (gitignored) — não é histórico de longo prazo, é só a lista do que
// ainda não foi confirmado/apagado.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MANIFEST_PATH = path.join(__dirname, ".test-data-manifest.json");
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

export interface TestCompanyEntry {
  id: number;
  document: string;
  name: string;
  specFile: string;
  createdAt: string;
}

export function recordTestCompany(entry: Omit<TestCompanyEntry, "createdAt">): void {
  const manifest = readManifest();
  manifest.push({ ...entry, createdAt: new Date().toISOString() });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

export function readManifest(): TestCompanyEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function extractCompanyId(url: string): number {
  const match = url.match(/\/companies\/(\d+)\/contract/);
  if (!match) throw new Error(`Não foi possível extrair o id de empresa da URL: ${url}`);
  return Number(match[1]);
}

// Limpeza IMEDIATA, dentro do próprio teste (ex: test.afterEach) — diferente
// da limpeza "entre sessões" que sempre exige confirmação explícita no chat.
// Aqui não há ambiguidade: é o mesmo processo de teste apagando algo que ele
// mesmo acabou de criar há segundos, necessário pra outros testes do mesmo
// arquivo poderem reusar o mesmo CNPJ (companies.document é UNIQUE — ORD-065).
// Também remove a entrada do manifesto, já que não fica mais pendente.
export function hardDeleteImmediately(id: number): void {
  execFileSync(
    "docker", ["compose", "exec", "-T", "company-service", "python", "scripts/cleanup_test_data.py", String(id)],
    { cwd: REPO_ROOT, stdio: "ignore" }
  );
  const manifest = readManifest().filter((e) => e.id !== id);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}
