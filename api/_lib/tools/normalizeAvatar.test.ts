import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { avatarConfig, avatarSpec } from './avatarConfig.js';

const LIFT = avatarConfig().normalize.ankle_lift;
import { measureFigure, normalizeAvatar } from './normalizeAvatar.js';

// A fake cutout: a body block standing on two feet, apart like a step, on a transparent canvas.
async function fakeCutout(width = 600, height = 1200, opaque = false) {
  const data = Buffer.alloc(width * height * 4);
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([90, 60, 40, 255], (y * width + x) * 4);
  };
  if (opaque) paint(0, 0, width, height);
  paint(250, 100, 350, 1000); // head to hips
  paint(200, 1000, 270, 1100); // left foot
  paint(330, 1000, 420, 1100); // right foot, further out
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function measure(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { fig: measureFigure(data, info.width, info.height, info.channels), info };
}

describe('measureFigure', () => {
  it('puts the ground point between the feet, raised from the lowest pixel', async () => {
    const { fig } = await measure(await fakeCutout());
    expect(fig.top).toBe(100);
    expect(fig.bottom).toBe(1100);
    expect(fig.groundX).toBe((200 + 420) / 2);
    expect(fig.groundY).toBeCloseTo(1100 - LIFT * 1000);
  });
});

describe('normalizeAvatar', () => {
  const spec = avatarSpec();

  for (const heightM of [1.45, 1.8, 2.0]) {
    it(`plants a ${heightM} m person on the cross with the head on the right line`, async () => {
      const { png } = await normalizeAvatar(await fakeCutout(), heightM);
      const { fig, info } = await measure(png);
      expect([info.width, info.height]).toEqual(spec.canvas);
      expect(Math.abs(fig.groundX - spec.anchor[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(fig.groundY - spec.anchor[1])).toBeLessThanOrEqual(1.5);
      expect(Math.abs(fig.top - (spec.anchor[1] - heightM * spec.pxPerM))).toBeLessThanOrEqual(1.5);
    });
  }

  it('bakes no shadow: the floor under the feet stays clear (the room draws it in 3D)', async () => {
    const { png } = await normalizeAvatar(await fakeCutout(), 1.8);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    // just below the lowest foot pixel, under the anchor
    const floorY = Math.round(spec.anchor[1] + ((LIFT / (1 - LIFT)) * 1.8 * spec.pxPerM)) + 12;
    expect(data[(floorY * info.width + spec.anchor[0]) * 4 + 3]).toBe(0);
  });

  it('refuses an image with no transparent background', async () => {
    await expect(normalizeAvatar(await fakeCutout(600, 1200, true), 1.8)).rejects.toThrow('no transparent background');
  });
});
