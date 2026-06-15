let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function beep(freq: number, duration: number, gain: number) {
  const c = getCtx();
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.connect(vol);
  vol.connect(c.destination);
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(gain, c.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

export function beepSuccess() {
  try { beep(880, 0.12, 0.4); } catch { /* no audio permission */ }
}

export function beepError() {
  try {
    beep(220, 0.15, 0.4);
    setTimeout(() => beep(180, 0.2, 0.3), 150);
  } catch { /* no audio permission */ }
}
