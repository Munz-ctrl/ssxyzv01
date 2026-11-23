import sharp from 'sharp';
import { avatarConfig, avatarSpec } from './avatarConfig.js';

const SPEC = avatarSpec();
const N = avatarConfig().normalize;

export interface Figure {
  top: number; // top edge of the head, px
  bottom: number; // bottom edge of the lowest opaque row, px
  groundX: number;
  groundY: number;
  height: number; // bottom - top
  transparentShare: number; // share of pixels below the alpha threshold
}

// Finds the person in an RGBA buffer. Ground point = horizontal center of the lowest 4% of the
// figure, raised by 3% of its height: the ankle center, not the toe tips.
export function measureFigure(data: Uint8Array, width: number, height: number, channels = 4): Figure {
  const t = N.alpha_threshold;
  const rowMin = new Int32Array(height).fill(-1);
  const rowMax = new Int32Array(height).fill(-1);
  let clear = 0;
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + channels - 1] < t) {
        clear++;
        continue;
      }
      if (rowMin[y] < 0) rowMin[y] = x;
      rowMax[y] = x;
      count++;
    }
    // a single stray pixel does not count as part of the figure
    if (count < 2) rowMin[y] = rowMax[y] = -1;
  }
  let first = -1;
  let last = -1;
  for (let y = 0; y < height; y++) {
    if (rowMin[y] < 0) continue;
    if (first < 0) first = y;
    last = y;
  }
  if (first < 0) throw new Error('no figure found');

  const top = first;
  const bottom = last + 1;
  const h = bottom - top;
  const bandStart = bottom - N.foot_band * h;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let y = Math.floor(bandStart); y < bottom; y++) {
    if (rowMin[y] < 0) continue;
    minX = Math.min(minX, rowMin[y]);
    maxX = Math.max(maxX, rowMax[y] + 1);
  }
  return {
    top,
    bottom,
    height: h,
    groundX: (minX + maxX) / 2,
    groundY: bottom - N.ankle_lift * h,
    transparentShare: clear / (width * height),
  };
}

// Cutout (any format sharp reads, with alpha) -> avatar PNG on the spec canvas, sized to heightM.
export async function normalizeAvatar(cutout: Buffer, heightM: number) {
  const { data, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const fig = measureFigure(data, info.width, info.height, info.channels);
  if (fig.transparentShare < 0.05) throw new Error('cutout has no transparent background');

  const [cw, ch] = SPEC.canvas;
  const [ax, ay] = SPEC.anchor;
  const targetPx = heightM * SPEC.pxPerM;
  const scale = targetPx / (fig.groundY - fig.top);

  const sw = Math.max(1, Math.round(info.width * scale));
  const sh = Math.max(1, Math.round(info.height * scale));
  const sx = sw / info.width;
  const sy = sh / info.height;
  const left = Math.round(ax - fig.groundX * sx);
  const top = Math.round(ay - fig.groundY * sy);

  // keep only the part of the scaled image that lands on the canvas
  const srcLeft = Math.max(0, -left);
  const srcTop = Math.max(0, -top);
  const dstLeft = Math.max(0, left);
  const dstTop = Math.max(0, top);
  const w = Math.min(sw - srcLeft, cw - dstLeft);
  const h = Math.min(sh - srcTop, ch - dstTop);
  if (w <= 0 || h <= 0) throw new Error('figure lands outside the canvas');

  const person = await sharp(cutout)
    .ensureAlpha()
    .resize(sw, sh, { kernel: 'lanczos3' })
    .extract({ left: srcLeft, top: srcTop, width: w, height: h })
    .png()
    .toBuffer();

  const png = await sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: contactShadow(targetPx, ay + (fig.bottom - fig.groundY) * sy), left: 0, top: 0 },
      { input: person, left: dstLeft, top: dstTop },
    ])
    .png()
    .toBuffer();

  return { png, scale, figure: fig };
}

// A soft ellipse on the floor where the feet touch it. Floor circles look squashed by sin(33 deg).
function contactShadow(personPx: number, floorY: number): Buffer {
  const [cw, ch] = SPEC.canvas;
  const rx = (N.shadow.width_of_height * personPx) / 2;
  const ry = rx * N.shadow.squash;
  const o = N.shadow.opacity;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">
    <defs><radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity="${o}"/>
    <stop offset="0.55" stop-color="#000" stop-opacity="${(o * 0.45).toFixed(3)}"/>
    <stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${SPEC.anchor[0]}" cy="${floorY.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#s)"/>
  </svg>`;
  return Buffer.from(svg);
}
