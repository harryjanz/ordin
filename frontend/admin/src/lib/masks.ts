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
