// All Mini Gym audio is synthesised with Web Audio (no sound files): sound effects, a gym ambience, and
// "Gym Radio", a small step-sequencer that plays original loops through the wall speakers.
// Buses: sfx / ambience / music → master → speakers. Nothing plays until the first click (autoplay rules).

export type Sfx =
  | 'clank' | 'dumbbell' | 'beep' | 'locker' | 'grunt' | 'clap' | 'hammer' | 'fanfare' | 'whoosh' | 'scratch'
  | 'boom' | 'pop' | 'chalk';

export interface AudioSettings {
  masterVolume: number; muted: boolean;
  sfxOn: boolean; sfxVolume: number;
  ambienceOn: boolean; ambienceVolume: number;
  radioVolume: number;
}

let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, ambBus: GainNode, musicBus: GainNode;
let noiseBuf: AudioBuffer;
let settings: AudioSettings = { masterVolume: 0.8, muted: false, sfxOn: true, sfxVolume: 0.7, ambienceOn: false, ambienceVolume: 0.5, radioVolume: 0.6 };
let listener: () => { x: number; z: number } = () => ({ x: 0, z: 0 });
let crowd = 0; // members inside, scales the ambience

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  // a gentle limiter so stacked kicks, booms and claps never clip
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.15;
  limiter.connect(ctx.destination);
  master = ctx.createGain(); master.connect(limiter);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applySettings(settings);
  return ctx;
}

/** Call from a user gesture (first click/key) so the browser lets us play sound. */
export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
  startAmbience();
}

export function applySettings(s: AudioSettings): void {
  settings = s;
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume, t, 0.05);
  sfxBus.gain.setTargetAtTime(s.sfxOn ? s.sfxVolume : 0, t, 0.05);
  ambBus.gain.setTargetAtTime(s.ambienceOn ? s.ambienceVolume : 0, t, 0.2);
  musicBus.gain.setTargetAtTime(s.radioVolume, t, 0.05);
}

/** Where the "ears" are (the camera target), for panning and distance. */
export function setListener(fn: () => { x: number; z: number }): void { listener = fn; }
export function setCrowd(n: number): void { crowd = n; }

// ---------- building blocks ----------

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function osc(type: OscillatorType, freq: number, t: number, dur: number, peak: number, out: AudioNode, glideTo?: number): void {
  const c = ctx!;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  env(g, t, peak, 0.005, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(t: number, dur: number, peak: number, out: AudioNode, filter: BiquadFilterType, freq: number, q = 1, sweepTo?: number): void {
  const c = ctx!;
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = c.createGain(); env(g, t, peak, 0.004, dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

// ---------- sound effects ----------

/** Play an effect at a gym position (panned and quieter with distance from the camera target). */
export function playSfx(kind: Sfx, pos?: { x: number; z: number }, gain = 1): void {
  if (!ctx || ctx.state !== 'running' || !settings.sfxOn || settings.muted) return;
  const c = ctx;
  const t = c.currentTime + 0.01;
  const l = listener();
  const dx = pos ? pos.x - l.x : 0, dz = pos ? pos.z - l.z : 0;
  const dist = Math.hypot(dx, dz);
  const out = c.createGain();
  out.gain.value = gain / (1 + dist / 9);
  const pan = c.createStereoPanner();
  pan.pan.value = Math.max(-0.8, Math.min(0.8, dx / 14));
  out.connect(pan); pan.connect(sfxBus);
  const r = () => 0.9 + Math.random() * 0.2;
  switch (kind) {
    case 'clank': // plates meeting the J-hooks
      for (const f of [523, 787, 1180, 1690]) osc('square', f * r(), t, 0.22, 0.05, out);
      noise(t, 0.08, 0.25, out, 'bandpass', 3000, 2);
      break;
    case 'dumbbell':
      osc('sine', 140 * r(), t, 0.15, 0.4, out, 70);
      for (const f of [660, 990]) osc('triangle', f * r(), t + 0.01, 0.12, 0.05, out);
      break;
    case 'beep': // card reader
      osc('sine', 1760, t, 0.07, 0.15, out);
      osc('sine', 2200, t + 0.1, 0.09, 0.15, out);
      break;
    case 'locker':
      noise(t, 0.12, 0.2, out, 'lowpass', 900);
      for (const f of [420, 610]) osc('square', f, t + 0.02, 0.1, 0.03, out);
      break;
    case 'grunt': { // cartoonish "HNNGH"
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(150 * r(), t); o.frequency.exponentialRampToValueAtTime(95, t + 0.35);
      f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 4;
      env(g, t, 0.35, 0.03, 0.35);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
      break;
    }
    case 'clap':
      for (let i = 0; i < 5; i++) noise(t + i * 0.11 + Math.random() * 0.03, 0.06, 0.35, out, 'bandpass', 1500, 1.5);
      break;
    case 'hammer':
      osc('sine', 220 * r(), t, 0.08, 0.35, out, 120);
      noise(t, 0.03, 0.3, out, 'highpass', 2500);
      break;
    case 'fanfare': // a tiny brass-ish arpeggio for titles and ceremonies
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { osc('triangle', f, t + i * 0.12, 0.35, 0.12, out); osc('sawtooth', f, t + i * 0.12, 0.25, 0.025, out); });
      break;
    case 'whoosh': // aura power-up
      noise(t, 0.9, 0.35, out, 'bandpass', 300, 3, 2600);
      osc('sine', 180, t, 0.9, 0.12, out, 720);
      break;
    case 'scratch': // a tiny record scratch for a failed flirt
      osc('sawtooth', 900, t, 0.22, 0.08, out, 120);
      noise(t, 0.2, 0.2, out, 'bandpass', 1800, 2, 400);
      break;
    case 'boom': // a heavy drop
      osc('sine', 70, t, 0.7, 0.9, out, 32);
      noise(t, 0.4, 0.5, out, 'lowpass', 400);
      for (const f of [300, 470]) osc('square', f, t, 0.3, 0.03, out);
      break;
    case 'pop':
      osc('sine', 600, t, 0.12, 0.2, out, 1200);
      break;
    case 'chalk':
      noise(t, 0.25, 0.12, out, 'highpass', 4000);
      break;
  }
}

// ---------- ambience ----------

let ambStarted = false;
function startAmbience(): void {
  if (!ctx || ambStarted) return;
  ambStarted = true;
  const c = ctx;
  // a low murmur: looped, softly filtered noise whose level follows how busy the gym is
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
  const g = c.createGain(); g.gain.value = 0.0;
  src.connect(f); f.connect(g); g.connect(ambBus); src.start();
  // distant clanks, beeps and footsteps every couple of seconds
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    g.gain.setTargetAtTime(Math.min(0.12, 0.015 + crowd * 0.003), ctx.currentTime, 1);
    if (!settings.ambienceOn || Math.random() > Math.min(0.85, 0.2 + crowd * 0.02)) return;
    const t = ctx.currentTime + Math.random() * 1.5;
    const out = ctx.createGain(); out.gain.value = 0.25; out.connect(ambBus);
    const k = Math.random();
    if (k < 0.5) { for (const fr of [440, 690, 1020]) osc('square', fr * (0.8 + Math.random() * 0.4), t, 0.25, 0.012, out); }
    else if (k < 0.8) osc('sine', 120 + Math.random() * 40, t, 0.12, 0.08, out, 60);
    else noise(t, 0.05, 0.05, out, 'lowpass', 700);
  }, 1800);
}

// ---------- Gym Radio ----------

export interface RadioStation { id: string; name: string; bpm: number }
export const STATIONS: RadioStation[] = [
  { id: 'lofi', name: 'Lo-fi Lifts', bpm: 86 },
  { id: 'pump', name: 'Pump FM', bpm: 124 },
  { id: 'cardio', name: 'Cardio Bounce', bpm: 140 },
];

const N = (m: number) => 440 * Math.pow(2, (m - 69) / 12); // MIDI note → Hz
// four-bar progressions (MIDI chord tones), one per station
const PROGS: Record<string, number[][]> = {
  lofi: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],      // Am7 Fmaj7 Cmaj7 G7
  pump: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]],                       // Dm Bb C Am
  cardio: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],                     // Em C G D
};

let radio: { station: RadioStation; step: number; nextTime: number; timer: number; startedAt: number } | null = null;
const radioListeners = new Set<(playing: string | null) => void>();

export function radioPlaying(): string | null { return radio?.station.id ?? null; }
export function onRadio(fn: (playing: string | null) => void): () => void { radioListeners.add(fn); return () => { radioListeners.delete(fn); }; }

/** 0..1 position within the current beat (for pulsing speakers), or null when nothing plays. */
export function radioBeat(): number | null {
  if (!radio || !ctx) return null;
  const spb = 60 / radio.station.bpm;
  return (((ctx.currentTime - radio.startedAt) / spb) % 1 + 1) % 1;
}

export function playRadio(id: string): void {
  unlockAudio();
  if (!ctx) return;
  stopRadio(false);
  const station = STATIONS.find((s) => s.id === id) ?? STATIONS[0];
  const now = ctx.currentTime + 0.1;
  radio = { station, step: 0, nextTime: now, startedAt: now, timer: window.setInterval(schedule, 25) };
  radioListeners.forEach((fn) => fn(station.id));
}

export function stopRadio(notify = true): void {
  if (radio) clearInterval(radio.timer);
  radio = null;
  if (notify) radioListeners.forEach((fn) => fn(null));
}

function schedule(): void {
  if (!ctx || !radio) return;
  const st = radio.station;
  const sixteenth = 60 / st.bpm / 4;
  while (radio.nextTime < ctx.currentTime + 0.12) {
    playStep(st.id, radio.step, radio.nextTime, sixteenth);
    radio.nextTime += sixteenth * (st.id === 'lofi' && radio.step % 2 === 0 ? 1.12 : st.id === 'lofi' ? 0.88 : 1); // swing for lo-fi
    radio.step = (radio.step + 1) % 256;
  }
}

function playStep(id: string, step: number, t: number, sixteenth: number): void {
  const out = musicBus;
  const s16 = step % 16, bar = Math.floor(step / 16) % 4;
  const chord = PROGS[id][bar];
  const kick = (f0: number) => osc('sine', f0, t, 0.28, 0.9, out, 40);
  const snare = () => { noise(t, 0.14, 0.35, out, 'bandpass', 1800, 0.8); osc('triangle', 190, t, 0.08, 0.15, out); };
  const hat = (v: number) => noise(t, 0.03, v, out, 'highpass', 7000);
  if (id === 'lofi') {
    if (s16 === 0 || s16 === 10) kick(110);
    if (s16 === 4 || s16 === 12) snare();
    if (s16 % 2 === 0) hat(0.06);
    if (s16 === 0) chord.forEach((m) => { osc('triangle', N(m + 12), t, sixteenth * 14, 0.035, out); osc('sine', N(m + 12) * 1.004, t, sixteenth * 14, 0.025, out); });
    if (s16 === 0 || s16 === 7) osc('sine', N(chord[0] - 12), t, sixteenth * 5, 0.25, out);
    if (s16 === 14 && Math.random() < 0.5) osc('sine', N(chord[2] + 24), t, sixteenth * 2, 0.04, out); // a little melody flick
  } else {
    if (s16 % 4 === 0) kick(id === 'pump' ? 130 : 150);
    if (s16 === 4 || s16 === 12) snare();
    if (s16 % 2 === 1) hat(0.08);
    if (id === 'cardio' && s16 % 4 === 2) hat(0.12);
    // driving bass on the off-beats, chord stabs
    if (s16 % 2 === 0) osc('sawtooth', N(chord[0] - 12), t, sixteenth * 1.6, s16 % 4 === 2 ? 0.09 : 0.05, out);
    if (s16 === 2 || s16 === 10) chord.forEach((m) => osc('square', N(m + 12), t, sixteenth * 1.2, 0.02, out));
    if (id === 'cardio' && s16 % 4 === 3) osc('triangle', N(chord[(s16 >> 2) % chord.length] + 24), t, sixteenth, 0.04, out);
  }
}

/** Debug/testing: what the audio graph is doing right now. */
export function audioState() {
  return ctx ? { state: ctx.state, master: master.gain.value, sfx: sfxBus.gain.value, ambience: ambBus.gain.value, music: musicBus.gain.value, radio: radioPlaying() } : null;
}
