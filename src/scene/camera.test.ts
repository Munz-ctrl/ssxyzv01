import { describe, expect, it } from 'vitest';
import { avatarPlane, floorLineAngle, project, pxPerMeter, tileCenter } from './camera';

const edgePx = (w: number, h: number) => {
  const [x, y] = project([1, 0, 0]);
  return Math.hypot(x, y) * pxPerMeter(w, h);
};

describe('camera', () => {
  it('matches the old grid: tile edge 165 px at 1080 portrait, 93 px at 1920 landscape', () => {
    expect(pxPerMeter(1080, 1920)).toBeCloseTo(205);
    expect(pxPerMeter(1920, 1080)).toBeCloseTo(116);
    expect(edgePx(1080, 1920)).toBeCloseTo(165, 0);
    expect(edgePx(1920, 1080)).toBeCloseTo(93.4, 0);
  });

  it('draws floor lines at about 28.5 degrees', () => {
    expect(floorLineAngle()).toBeCloseTo(28.57, 1);
  });

  it('makes the diamond 290 px wide at 1080 portrait', () => {
    const [x] = project([1, 0, -1]);
    expect(Math.abs(x) * pxPerMeter(1080, 1920)).toBeCloseTo(290, 0);
  });

  it('shows a 1.8 m person about 310 px tall at 1080 portrait', () => {
    const [, y] = project([0, 1.8, 0]);
    expect(y * pxPerMeter(1080, 1920)).toBeCloseTo(309.5, 0);
  });

  it('sizes the avatar plane so the feet anchor sits on the floor', () => {
    const p = avatarPlane();
    expect(p.height).toBeCloseTo((1000 / 620) * 1.8);
    expect(p.width / p.height).toBeCloseTo(0.8);
    expect(p.offsetX).toBeCloseTo(0);
    // anchor at 875 of 1000 (ankle center): plane center sits 0.375 of the height above the ground point
    expect(p.offsetY).toBeCloseTo(0.375 * p.height);
  });

  it('counts tiles from the back corner', () => {
    expect(tileCenter(0, 0)).toEqual([-2.5, -2.5]);
    expect(tileCenter(3, 3)).toEqual([0.5, 0.5]);
  });
});
