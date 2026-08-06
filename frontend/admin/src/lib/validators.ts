// Espelha services/company/domain/{cnpj,cpf,address}.py — mesmo algoritmo,
// validação client-side instantânea. O backend continua sendo a fonte de
// verdade (revalida tudo); isto só evita um round-trip pra erro óbvio.

const CNPJ_WEIGHTS_12 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_ZERADO = "0".repeat(14);

export function normalizeCnpj(raw: string): string {
  return raw.trim().toUpperCase().replace(/[./-]/g, "");
}

function charValue(ch: string): number {
  return ch.charCodeAt(0) - 48;
}

function checkDigit(values: number[], weights: number[]): number {
  const total = values.reduce((sum, v, i) => sum + v * weights[i], 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);
  if (cnpj.length !== 14 || cnpj === CNPJ_ZERADO) return false;
  const base = cnpj.slice(0, 12);
  const dv = cnpj.slice(12);
  if (![...base].every((c) => /[0-9A-Z]/.test(c))) return false;
  if (!/^\d{2}$/.test(dv)) return false;
  const values = [...base].map(charValue);
  const dv1 = checkDigit(values, CNPJ_WEIGHTS_12);
  const dv2 = checkDigit([...values, dv1], [6, ...CNPJ_WEIGHTS_12]);
  return dv === `${dv1}${dv2}`;
}

export function normalizeCpf(raw: string): string {
  return raw.trim().replace(/[.\- ]/g, "");
}

function cpfCheckDigit(partial: string): number {
  const weights = Array.from({ length: partial.length }, (_, i) => partial.length + 1 - i);
  const total = [...partial].reduce((sum, d, i) => sum + Number(d) * weights[i], 0);
  const remainder = (total * 10) % 11;
  return remainder < 10 ? remainder : 0;
}

export function isValidCpf(raw: string): boolean {
  const cpf = normalizeCpf(raw);
  if (cpf.length !== 11 || !/^\d{11}$/.test(cpf)) return false;
  if (cpf === cpf[0].repeat(11)) return false;
  const d1 = cpfCheckDigit(cpf.slice(0, 9));
  const d2 = cpfCheckDigit(cpf.slice(0, 9) + d1);
  return cpf.slice(9) === `${d1}${d2}`;
}

export function normalizeCep(raw: string): string {
  return raw.trim().replace(/[.\- ]/g, "");
}

export function isValidCep(raw: string): boolean {
  const cep = normalizeCep(raw);
  return cep.length === 8 && /^\d{8}$/.test(cep);
}
