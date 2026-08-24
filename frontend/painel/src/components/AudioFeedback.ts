// ORD-119 — mesmo padrão de frontend/balcao/src/components/AudioFeedback.ts
// (Web Audio API, sem asset externo). Aqui é um "ding-dong" de 2 tons, mais
// chamativo que o beep simples do balcão — o painel é uma TV ambiente, sem
// ninguém olhando o tempo todo, precisa de mais destaque que uma confirmação
// de ação pontual.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function beep(freq: number, startDelay: number, duration: number, gain: number) {
  const c = getCtx();
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.connect(vol);
  vol.connect(c.destination);
  osc.frequency.value = freq;
  const start = c.currentTime + startDelay;
  vol.gain.setValueAtTime(gain, start);
  vol.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.start(start);
  osc.stop(start + duration);
}

// Navegador bloqueia áudio sem gesto do usuário antes — numa TV sem
// interação nenhuma isso pode nunca acontecer. unlockAudio() é chamado no
// primeiro toque/clique que a tela receber (ex: durante a instalação), pra
// destravar o quanto antes; chimeReady() também tenta resume() em toda
// chamada, defensivamente.
export function unlockAudio() {
  try { getCtx().resume(); } catch { /* ignora */ }
}

export function chimeReady() {
  try {
    const c = getCtx();
    if (c.state === "suspended") c.resume();
    beep(660, 0, 0.18, 0.35);
    beep(880, 0.16, 0.22, 0.35);
  } catch { /* sem permissão/suporte de áudio */ }
}
