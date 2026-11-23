import { describe, expect, it } from 'vitest';
import { avatarPlane, backdropHeight, clampView, floorFromScreen, floorLineAngle, pickOnFloor, project, pxPerMeter, rubber, tileCenter } from './camera';

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

describe('camera moves and picking (02d)', () => {
  it('finds the floor point under a screen point', () => {
    for (const p of [[0, 0], [2.5, -1], [-3, 2]] as [number, number][]) {
      const [x, z] = floorFromScreen(project([p[0], 0, p[1]]));
      expect(x).toBeCloseTo(p[0]);
      expect(z).toBeCloseTo(p[1]);
    }
  });

  it('makes backdrops reach past the top of the screen at 1x', () => {
    const topM = 1920 / 2 / pxPerMeter(1080, 1920);
    const ends: [number, number][] = [[-3, -3], [3, -3]];
    const h = backdropHeight(ends, topM, 0);
    for (const [x, z] of ends) expect(project([x, h, z])[1]).toBeGreaterThanOrEqual(topM - 1e-9);
    expect(Math.min(...ends.map(([x, z]) => project([x, h, z])[1]))).toBeCloseTo(topM);
  });

  it('keeps zoom between 1x and 3x and the view inside the 1x frame', () => {
    expect(clampView(5, [0, 0], 2, 4).zoom).toBe(3);
    expect(clampView(0.5, [1, 1], 2, 4)).toEqual({ zoom: 1, pan: [0, 0] });
    expect(clampView(2, [5, -5], 2, 4).pan).toEqual([1, -2]);
    expect(rubber(4, 1, 3)).toBeCloseTo(3 + 1 / 3);
    expect(rubber(2, 1, 3)).toBe(2);
  });

  it('picks a grid segment near a line and the floor elsewhere', () => {
    // world (0, 0) is grid point (3, 3)
    expect(pickOnFloor(0.5, 0.02, 0.1)).toEqual({ kind: 'edge', edge: [3, 3, 'x'] });
    expect(pickOnFloor(-0.03, -0.6, 0.1)).toEqual({ kind: 'edge', edge: [3, 2, 'z'] });
    expect(pickOnFloor(0.5, 0.5, 0.1)).toEqual({ kind: 'floor' });
    expect(pickOnFloor(40, 0.01, 0.1)).toEqual({ kind: 'floor' });
  });
});
