import sharp from 'sharp';

// Turns a generated picture into a 1 m texture: square, seamless when repeated, a little flatter.

// Blends each edge with the picture shifted by half its size, so the left edge continues into the
// right one and the top into the bottom. `band` = share of the width that gets blended at each side.
// Done once across, then once down; each pass keeps the other direction seamless.
export function blendEdges(data: Uint8Array, size: number, channels: number, band: number): Uint8Array {
  if (band <= 0) return data;
  const weight = (p: number) => {
    // 0 in the middle, 1 at the edges, smooth in between
    const d = Math.abs(p / (size - 1) - 0.5) * 2;
    const t = Math.min(1, Math.max(0, (d - (1 - 2 * band)) / (2 * band)));
    return t * t * (3 - 2 * t);
  };
  const w = Float32Array.from({ length: size }, (_, p) => weight(p));
  const half = size / 2;
  const pass = (src: Uint8Array, across: boolean) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const k = across ? w[x] : w[y];
        const sx = across ? (x + half) % size : x;
        const sy = across ? y : (y + half) % size;
        const a = (y * size + x) * channels;
        const b = (sy * size + sx) * channels;
        for (let c = 0; c < channels; c++) out[a + c] = Math.round(src[a + c] * (1 - k) + src[b + c] * k);
      }
    }
    return out;
  };
  return pass(pass(data, true), false);
}

export async function toTexture(
  input: Buffer,
  opts: { size: number; band: number; saturation: number; contrast: number },
): Promise<Buffer> {
  const { size, band, saturation, contrast } = opts;
  const { data, info } = await sharp(input)
    .rotate()
    .resize(size, size, { fit: 'cover' })
    .removeAlpha()
    .modulate({ saturation })
    .linear(contrast, 128 * (1 - contrast))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blended = blendEdges(data, size, info.channels, band);
  return sharp(Buffer.from(blended), { raw: { width: size, height: size, channels: info.channels } })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}
