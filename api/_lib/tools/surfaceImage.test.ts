import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { blendEdges, toTexture } from './surfaceImage.js';

// A picture that is very much not seamless: a left-to-right and top-to-bottom ramp.
function ramp(size: number) {
  const data = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set([Math.round((x / (size - 1)) * 255), Math.round((y / (size - 1)) * 255), 90], (y * size + x) * 3);
  return data;
}

// Largest jump between a column (or row) and the next one, wrapping around.
function worstJump(data: Uint8Array, size: number, across: boolean, wrapOnly: boolean) {
  let worst = 0;
  for (let a = 0; a < size; a++) {
    if (wrapOnly && a !== size - 1) continue;
    const b = (a + 1) % size;
    for (let k = 0; k < size; k++) {
      const p = across ? (k * size + a) * 3 : (a * size + k) * 3;
      const q = across ? (k * size + b) * 3 : (b * size + k) * 3;
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(data[p + c] - data[q + c]));
    }
  }
  return worst;
}

describe('surface textures', () => {
  it('makes the edges meet when repeated', () => {
    const size = 128;
    const src = ramp(size);
    expect(worstJump(src, size, true, true)).toBe(255);
    const out = blendEdges(src, size, 3, 0.18);
    // across the repeat seam it is now as smooth as anywhere inside
    expect(worstJump(out, size, true, true)).toBeLessThanOrEqual(6);
    expect(worstJump(out, size, false, true)).toBeLessThanOrEqual(6);
    // and the middle is untouched
    const mid = ((size / 2) * size + size / 2) * 3;
    expect([...out.slice(mid, mid + 3)]).toEqual([...src.slice(mid, mid + 3)]);
  });

  it('outputs a square 1 m jpeg at the configured size', async () => {
    const png = await sharp(Buffer.from(ramp(300).buffer), { raw: { width: 300, height: 300, channels: 3 } })
      .resize(400, 250)
      .png()
      .toBuffer();
    const jpg = await toTexture(png, { size: 256, band: 0.18, saturation: 0.85, contrast: 0.88 });
    const meta = await sharp(jpg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 256, 256]);
  });
});
