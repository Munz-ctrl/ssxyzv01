// Makes the free preset textures in public/surfaces/ (brief 02d). Each is 1 m x 1 m, seamless
// by construction (every pattern and noise repeats exactly once across the image).
// usage: npx tsx scripts/make-surfaces.ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SIZE = 1024;
const OUT = join(process.cwd(), 'public', 'surfaces');

// small seeded random, so the files come out the same every run
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise on a lattice that wraps: `cx` x `cy` cells across the image. Returns 0..1.
function noise(cx: number, cy: number, seed: number) {
  const r = rng(seed);
  const grid = Float32Array.from({ length: cx * cy }, () => r());
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const gx = (x / SIZE) * cx;
    const gy = (y / SIZE) * cy;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = fade(gx - x0), fy = fade(gy - y0);
    const at = (i: number, j: number) => grid[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

// Sum of octaves, -0.5..0.5 roughly.
function fbm(base: number, octaves: number, seed: number, stretch: [number, number] = [1, 1]) {
  const layers = Array.from({ length: octaves }, (_, o) => noise(base * 2 ** o * stretch[0], base * 2 ** o * stretch[1], seed + o * 101));
  return (x: number, y: number) => {
    let v = 0, amp = 0.5, total = 0;
    for (const n of layers) {
      v += (n(x, y) - 0.5) * amp;
      total += amp;
      amp *= 0.5;
    }
    return v / total;
  };
}

type Pixel = (x: number, y: number) => [number, number, number];

async function save(id: string, pixel: Pixel) {
  const data = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * SIZE + x) * 3;
      data[i] = Math.max(0, Math.min(255, Math.round(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  const img = sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } });
  await img.clone().jpeg({ quality: 84, mozjpeg: true }).toFile(join(OUT, `${id}.jpg`));
  await img.clone().resize(96, 96).jpeg({ quality: 80 }).toFile(join(OUT, 'thumbs', `${id}.jpg`));
  console.log('wrote', id);
}

const grey = (v: number): [number, number, number] => [v, v, v];
const wrap = (v: number) => ((v % SIZE) + SIZE) % SIZE;

// Speckles that wrap around the edges: returns brightness offsets per pixel.
function speckles(count: number, radius: [number, number], strength: [number, number], seed: number) {
  const r = rng(seed);
  const map = new Float32Array(SIZE * SIZE);
  for (let n = 0; n < count; n++) {
    const cx = r() * SIZE, cy = r() * SIZE;
    const rad = radius[0] + r() * (radius[1] - radius[0]);
    const s = strength[0] + r() * (strength[1] - strength[0]);
    for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++)
      for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
        const d = Math.hypot(dx, dy) / rad;
        if (d > 1) continue;
        const i = wrap(Math.round(cy + dy)) * SIZE + wrap(Math.round(cx + dx));
        map[i] += s * (1 - d * d);
      }
  }
  return (x: number, y: number) => map[y * SIZE + x];
}

async function main() {
  mkdirSync(join(OUT, 'thumbs'), { recursive: true });
  const fine = rng(7);

  // asphalt: dark, fine aggregate, soft patches (like the goal image floor)
  {
    const patches = fbm(3, 4, 11);
    const grain = fbm(64, 2, 12);
    const stones = speckles(9000, [0.8, 2.2], [-38, 46], 13);
    await save('asphalt', (x, y) => {
      const v = 66 + patches(x, y) * 26 + grain(x, y) * 22 + stones(x, y) + (fine() - 0.5) * 22;
      return [v - 1, v, v + 3];
    });
  }

  // concrete: light gray, blotchy, a few pores
  {
    const blotch = fbm(2, 5, 21);
    const grain = fbm(48, 2, 22);
    const pores = speckles(1400, [0.7, 1.6], [-45, -20], 23);
    await save('concrete', (x, y) => {
      const v = 168 + blotch(x, y) * 30 + grain(x, y) * 10 + pores(x, y) + (fine() - 0.5) * 9;
      return [v + 1, v, v - 3];
    });
  }

  // wood: 4 boards of 25 cm running across, staggered joints, grain along the board
  {
    const boards = 4;
    const bh = SIZE / boards;
    const r = rng(31);
    const tones = Array.from({ length: boards }, () => 0.85 + r() * 0.3);
    const joints = Array.from({ length: boards }, () => Math.floor(r() * SIZE));
    const grain = fbm(4, 4, 32, [1, 16]);
    const ring = fbm(2, 3, 33, [1, 6]);
    await save('wood', (x, y) => {
      const b = Math.floor(y / bh);
      const local = y - b * bh;
      let v = tones[b];
      const g = Math.sin((y / SIZE) * 220 + ring(x, y) * 40 + b * 13) * 0.5 + 0.5;
      v *= 0.86 + g * 0.1 + grain(x, y) * 0.35;
      const gap = local < 3 || local > bh - 2 || Math.abs(x - joints[b]) < 2 || Math.abs(x - joints[b] - SIZE) < 2;
      if (gap) v *= 0.55;
      return [168 * v, 120 * v, 78 * v];
    });
  }

  // white tile: 4 x 4 tiles of 25 cm, light grout
  {
    const tile = SIZE / 4;
    const r = rng(41);
    const tones = Array.from({ length: 16 }, () => 236 + r() * 10);
    const soft = fbm(8, 3, 42);
    await save('white_tile', (x, y) => {
      const gx = (x + 3) % tile, gy = (y + 3) % tile;
      if (gx < 6 || gy < 6) return grey(196 + (fine() - 0.5) * 10);
      const t = tones[Math.floor(((y + 3) % SIZE) / tile) * 4 + Math.floor(((x + 3) % SIZE) / tile)];
      const v = t + soft(x, y) * 8 + (fine() - 0.5) * 3;
      return [v, v, v - 1];
    });
  }

  // siding: 8 lap boards of 12.5 cm, each a little darker under the board above
  {
    const boards = 8;
    const bh = SIZE / boards;
    const streak = fbm(2, 3, 51, [1, 8]);
    await save('siding', (x, y) => {
      const local = (y % bh) / bh; // 0 at the top of a board
      let v = 1;
      if (local < 0.06) v = 0.72 + local * 3; // shadow line under the lap
      else v = 0.95 + local * 0.05;
      v *= 1 + streak(x, y) * 0.06 + (fine() - 0.5) * 0.025;
      return [214 * v, 207 * v, 192 * v];
    });
  }

  // brick: running bond, 4 bricks across and 14 courses per meter, light mortar
  {
    const across = 4;
    const courses = 14;
    const bw = SIZE / across;
    const ch = SIZE / courses;
    const r = rng(61);
    const tones = Array.from({ length: across * courses }, () => [0.85 + r() * 0.25, r()]);
    const grain = fbm(24, 3, 62);
    const mortar = 7;
    await save('brick', (x, y) => {
      const c = Math.floor(y / ch);
      const shift = c % 2 ? bw / 2 : 0;
      const bx = wrap(x + shift);
      const col = Math.floor(bx / bw);
      const inX = bx - col * bw;
      const inY = y - c * ch;
      if (inX < mortar || inY < mortar) return grey(184 + grain(x, y) * 20 + (fine() - 0.5) * 12);
      const [tone, hue] = tones[c * across + col];
      const v = tone * (1 + grain(x, y) * 0.35 + (fine() - 0.5) * 0.08);
      return [(150 + hue * 25) * v, (70 + hue * 12) * v, 52 * v];
    });
  }
}

void main();
