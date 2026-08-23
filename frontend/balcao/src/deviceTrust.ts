// ORD-120 — mesmo padrão do deviceTrust.ts do admin (ORD-092): token de
// dispositivo confiável guardado em localStorage, enviado via X-Device-Trust
// pra pular o passo de MFA em logins seguintes no mesmo navegador/device.
const KEY = "ordin-balcao-device-trust";

export function getDeviceTrustToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setDeviceTrustToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearDeviceTrustToken(): void {
  localStorage.removeItem(KEY);
}
