export interface LevelState {
  level: number;
  progress: number; // 0 to 1 toward the next level; 1 at the top level
}

// Lifetime earned = positive ledger rows only, so spending never lowers the level.
export function lifetimeEarned(rows: { delta: number }[]): number {
  return rows.reduce((a, r) => a + Math.max(0, r.delta), 0);
}

// thresholds[i] is the lifetime total where level i + 1 starts (thresholds[0] = 0 is lv 1).
export function levelFor(lifetime: number, thresholds: number[]): LevelState {
  let level = 1;
  while (level < thresholds.length && lifetime >= thresholds[level]) level += 1;
  if (level >= thresholds.length) return { level, progress: 1 };
  const from = thresholds[level - 1];
  const to = thresholds[level];
  return { level, progress: Math.max(0, Math.min(1, (lifetime - from) / (to - from))) };
}
