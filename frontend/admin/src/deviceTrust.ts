// ORD-092: token de "dispositivo confiável" — deliberadamente FORA do
// estado persistido pelo Zustand (ordin-admin-auth). Um logout comum é
// sobre a sessão, não sobre o navegador reconhecido — por isso vive numa
// chave própria que nenhuma rotina de logout() deve tocar. Só a ação
// explícita "Esquecer este dispositivo" (SettingsScreen) limpa esta chave.
const KEY = "ordin-device-trust";

export function getDeviceTrustToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setDeviceTrustToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearDeviceTrustToken(): void {
  localStorage.removeItem(KEY);
}
