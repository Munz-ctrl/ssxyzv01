import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ModelRef {
  model: string;
  version: string | null;
  input: Record<string, unknown>;
}

export interface AvatarConfig {
  generate: ModelRef & { guides: string[]; prompt: string };
  cutout: ModelRef & { image_field: string };
  normalize: {
    alpha_threshold: number;
    foot_band: number;
    ankle_lift: number;
    shadow: { width_of_height: number; squash: number; opacity: number };
  };
  photos: { min: number; max: number };
  stale_seconds: number;
}

const read = (file: string) => JSON.parse(readFileSync(join(process.cwd(), 'config', file), 'utf8'));

let config: AvatarConfig | null = null;
export function avatarConfig(): AvatarConfig {
  config ??= read('avatar.json') as AvatarConfig;
  return config;
}

// The avatar spec every PNG follows (config/camera.json): an 800 x 1000 canvas, the ground point
// (ankle center) at (400, 875), and 620 px above it = 1.8 m.
export function avatarSpec() {
  const a = read('camera.json').avatar;
  return {
    canvas: a.canvas_px as [number, number],
    anchor: a.anchor_px as [number, number],
    pxPerM: a.person_height_px / a.person_height_m,
  };
}
