// ORD-172 — espelha services/company/domain/cpf.py e
// frontend/admin/src/lib/validators.ts (mesmo algoritmo; totem e admin não
// compartilham lib). Backend continua sendo a fonte de verdade — isto só
// evita que um CPF obviamente inválido (dígito verificador errado) chegue a
// virar `cpf_destinatario` no payload da NFC-e.

function cpfCheckDigit(partial: string): number {
  const weights = Array.from({ length: partial.length }, (_, i) => partial.length + 1 - i);
  const total = [...partial].reduce((sum, d, i) => sum + Number(d) * weights[i], 0);
  const remainder = (total * 10) % 11;
  return remainder < 10 ? remainder : 0;
}

export function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || !/^\d{11}$/.test(digits)) return false;
  if (digits === digits[0].repeat(11)) return false;
  const d1 = cpfCheckDigit(digits.slice(0, 9));
  const d2 = cpfCheckDigit(digits.slice(0, 9) + d1);
  return digits.slice(9) === `${d1}${d2}`;
}
