import { describe, expect, it } from 'vitest';
import { levelFor, lifetimeEarned } from './level.js';

const t = [0, 50, 120, 220];

describe('levelFor', () => {
  it('matches the thresholds', () => {
    expect(levelFor(0, t)).toEqual({ level: 1, progress: 0 });
    expect(levelFor(25, t)).toEqual({ level: 1, progress: 0.5 });
    expect(levelFor(49, t).level).toBe(1);
    expect(levelFor(50, t)).toEqual({ level: 2, progress: 0 });
    expect(levelFor(119, t).level).toBe(2);
    expect(levelFor(120, t).level).toBe(3);
    expect(levelFor(170, t)).toEqual({ level: 3, progress: 0.5 });
  });
  it('stays full at the top level', () => {
    expect(levelFor(220, t)).toEqual({ level: 4, progress: 1 });
    expect(levelFor(9999, t)).toEqual({ level: 4, progress: 1 });
  });
});

describe('lifetimeEarned', () => {
  it('ignores spending, so the level never drops', () => {
    const rows = [{ delta: 40 }, { delta: 20 }];
    const before = levelFor(lifetimeEarned(rows), t);
    const after = levelFor(lifetimeEarned([...rows, { delta: -30 }, { delta: -30 }]), t);
    expect(lifetimeEarned([...rows, { delta: -30 }])).toBe(60);
    expect(after).toEqual(before);
    expect(after.level).toBe(2);
  });
});
