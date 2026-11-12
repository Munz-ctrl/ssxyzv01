let ctx: AudioContext | null = null;

// Call from a tap so the browser allows audio.
export function unlockSound() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(from: number, to: number, seconds: number, volume: number, type: OscillatorType) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + seconds);
}

const SCALE = [0, 4, 7, 12, 16, 19, 24];

export function chime(step: number) {
  const f = 660 * Math.pow(2, SCALE[step % SCALE.length] / 12);
  tone(f, f, 0.28, 0.12, 'sine');
}

export function thud() {
  tone(95, 45, 0.32, 0.4, 'sine');
}
