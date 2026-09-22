// Máscaras são só apresentação — o payload enviado ao backend vai sem máscara
// (o próprio backend normaliza de qualquer forma, ver domain/cnpj.py e cpf.py).

import { normalizeCep, normalizeCnpj, normalizeCpf } from "./validators";

export function formatCnpj(raw: string): string {
  const c = normalizeCnpj(raw);
  if (c.length <= 2) return c;
  if (c.length <= 5) return `${c.slice(0, 2)}.${c.slice(2)}`;
  if (c.length <= 8) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}`;
  if (c.length <= 12) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8)}`;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

export function formatCpf(raw: string): string {
  const c = normalizeCpf(raw);
  if (c.length <= 3) return c;
  if (c.length <= 6) return `${c.slice(0, 3)}.${c.slice(3)}`;
  if (c.length <= 9) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`;
}

export function formatCep(raw: string): string {
  const c = normalizeCep(raw);
  if (c.length <= 5) return c;
  return `${c.slice(0, 5)}-${c.slice(5, 8)}`;
}

// Telefone: sem dígito verificador pra validar (ao contrário de CNPJ/CPF/CEP)
// — só formata. 10 dígitos vira fixo (XXXX-XXXX), 11 vira celular (XXXXX-XXXX);
// a barra muda de posição sozinha conforme o usuário digita o 9º dígito.
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 11);
}

export function formatPhone(raw: string): string {
  const c = normalizePhone(raw);
  if (c.length <= 2) return c.length ? `(${c}` : c;
  if (c.length <= 6) return `(${c.slice(0, 2)}) ${c.slice(2)}`;
  if (c.length <= 10) return `(${c.slice(0, 2)}) ${c.slice(2, 6)}-${c.slice(6)}`;
  return `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}`;
}
