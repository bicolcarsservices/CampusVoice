// Sound effects made in code with the browser's Web Audio (no sound files needed). One mute switch for everything.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let jetting: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

try { muted = localStorage.getItem('msa-muted') === '1'; } catch { /* storage may be blocked */ }

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio is optional */ }
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('msa-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.6;
  if (m) jet(false);
}

function noise(dur: number, vol: number, type: BiquadFilterType, freq: number, delay = 0) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

function tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export type Sfx = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'rocket' | 'knife' | 'boom' | 'pickup' | 'reload' | 'hurt' | 'die' | 'round' | 'win' | 'throw' | 'swap';

export function play(name: Sfx, v = 1) {
  if (!ctx || muted || v <= 0.02) return;
  switch (name) {
    case 'pistol': noise(0.07, 0.5 * v, 'bandpass', 1800); tone(260, 90, 0.08, 0.25 * v, 'square'); break;
    case 'smg': noise(0.05, 0.35 * v, 'bandpass', 2200); tone(200, 100, 0.05, 0.15 * v, 'square'); break;
    case 'rifle': noise(0.1, 0.55 * v, 'lowpass', 2600); tone(150, 60, 0.12, 0.3 * v, 'sawtooth'); break;
    case 'sniper': noise(0.22, 0.7 * v, 'lowpass', 1800); tone(110, 40, 0.3, 0.5 * v, 'sawtooth'); break;
    case 'rocket': noise(0.5, 0.5 * v, 'lowpass', 900); tone(320, 70, 0.5, 0.25 * v, 'sawtooth'); break;
    case 'knife': noise(0.12, 0.3 * v, 'highpass', 3000); break;
    case 'boom': noise(0.9, 0.9 * v, 'lowpass', 500); tone(90, 30, 0.7, 0.6 * v, 'sine'); break;
    case 'pickup': tone(520, 780, 0.08, 0.25 * v, 'triangle'); tone(780, 1040, 0.1, 0.25 * v, 'triangle', 0.08); break;
    case 'reload': noise(0.03, 0.4 * v, 'highpass', 2500); noise(0.03, 0.4 * v, 'highpass', 3000, 0.18); break;
    case 'hurt': tone(220, 110, 0.14, 0.3 * v, 'square'); break;
    case 'die': tone(330, 45, 0.55, 0.35 * v, 'sawtooth'); noise(0.3, 0.3 * v, 'lowpass', 700); break;
    case 'throw': noise(0.08, 0.25 * v, 'bandpass', 800); break;
    case 'swap': noise(0.03, 0.3 * v, 'highpass', 2000); tone(400, 300, 0.05, 0.12 * v, 'square'); break;
    case 'round': [440, 554, 659].forEach((f, i) => tone(f, f, 0.14, 0.25 * v, 'triangle', i * 0.12)); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 0.28 * v, 'triangle', i * 0.13)); break;
  }
}

// Continuous jetpack hiss while flying.
export function jet(on: boolean) {
  if (!ctx || !master || !noiseBuf) return;
  if (on && !muted && !jetting) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650;
    const gain = ctx.createGain(); gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.12);
    src.connect(f); f.connect(gain); gain.connect(master); src.start();
    jetting = { src, gain };
  } else if ((!on || muted) && jetting) {
    const j = jetting; jetting = null;
    j.gain.gain.cancelScheduledValues(ctx.currentTime);
    j.gain.gain.setValueAtTime(j.gain.gain.value, ctx.currentTime);
    j.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
    j.src.stop(ctx.currentTime + 0.15);
  }
}
