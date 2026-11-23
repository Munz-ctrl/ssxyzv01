// Player height input -> meters. Returns null when it is not a believable human height.
export const HEIGHT_RANGE_M = { min: 0.9, max: 2.4 };

export function heightFromFeet(feet: string, inches: string): number | null {
  const ft = Number(feet || 0);
  const inch = Number(inches || 0);
  if (!Number.isFinite(ft) || !Number.isFinite(inch) || ft < 0 || inch < 0 || inch >= 12) return null;
  return inRange((ft * 12 + inch) * 0.0254);
}

export function heightFromCm(cm: string): number | null {
  const n = Number(cm);
  return Number.isFinite(n) ? inRange(n / 100) : null;
}

function inRange(m: number): number | null {
  return m >= HEIGHT_RANGE_M.min && m <= HEIGHT_RANGE_M.max ? Math.round(m * 1000) / 1000 : null;
}

// 1.803 -> "5'11"" and "180 cm"
export function heightLabel(m: number): string {
  const totalIn = Math.round(m / 0.0254);
  return `${Math.floor(totalIn / 12)}'${totalIn % 12}" / ${Math.round(m * 100)} cm`;
}
