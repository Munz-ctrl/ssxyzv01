// Sound effects, synthesized with the Web Audio API. No audio files.
// Every sound is short on purpose. If one feels long, cut it.

const KEY = 'ssx-v0-sound';

let ctx: AudioContext | null = null;
let on: boolean | null = null;

export function soundOn(): boolean {
  if (on === null) {
    try {
      on = localStorage.getItem(KEY) !== 'off';
    } catch {
      on = true;
    }
  }
  return on;
}

export function setSoundOn(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off');
  } catch {
    // storage can be unavailable: the choice just lasts until reload
  }
}

// The context is created on the first tap, because iOS needs a user gesture.
function unlock() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function audio(): AudioContext | null {
  return soundOn() && ctx && ctx.state !== 'closed' ? ctx : null;
}

function tone(c: AudioContext, o: { from: number; to?: number; at?: number; seconds: number; volume: number; type: OscillatorType }) {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.from, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.seconds);
  gain.gain.setValueAtTime(o.volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.seconds);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + o.seconds + 0.01);
}

// A very short, soft tick.
export function tap() {
  const c = audio();
  if (c) tone(c, { from: 1400, to: 900, seconds: 0.024, volume: 0.05, type: 'sine' });
}

// Major pentatonic, one step up per cube line, wrapping into the next octave.
const STEPS = [0, 2, 4, 7, 9];

// A short bright chime. i = 0 is the first cube line of a receipt.
export function cube(i: number) {
  const c = audio();
  if (!c) return;
  const n = Math.min(Math.max(0, i), 14);
  const semitones = STEPS[n % STEPS.length] + 12 * Math.floor(n / STEPS.length);
  const f = 660 * Math.pow(2, semitones / 12);
  tone(c, { from: f, seconds: 0.22, volume: 0.12, type: 'sine' });
  tone(c, { from: f * 2, seconds: 0.12, volume: 0.03, type: 'sine' });
}

// A soft rising whoosh: filtered noise sweeping up while the level bar fills.
export function fill(seconds = 0.6) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(250, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + seconds);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.07, t + seconds * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t);
}

// A short three note sting.
export function levelUp() {
  const c = audio();
  if (!c) return;
  [0, 7, 12].forEach((semi, i) => {
    const f = 523 * Math.pow(2, semi / 12);
    tone(c, { from: f, at: i * 0.09, seconds: 0.3, volume: 0.12, type: 'triangle' });
  });
}

// A dull low thump for a dump that earned nothing.
export function thud() {
  const c = audio();
  if (c) tone(c, { from: 95, to: 45, seconds: 0.3, volume: 0.4, type: 'sine' });
}

// Ticks on every button press, anywhere in the app. Returns the cleanup.
export function installTapSound(): () => void {
  const onClick = (e: MouseEvent) => {
    const button = e.target instanceof Element ? e.target.closest('button') : null;
    if (!button) return;
    unlock();
    if (!button.disabled) tap();
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
