import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomRules } from '../../../shared/room.js';
import type { ModelRef } from './avatarConfig.js';

const read = (file: string) => JSON.parse(readFileSync(join(process.cwd(), 'config', file), 'utf8'));

let rules: RoomRules | null = null;
export function roomRules(): RoomRules {
  if (!rules) {
    const r = read('camera.json').room;
    rules = { size: r.size_m, heights: r.wall_heights_m, gridLimits: r.grid_limits, maxWalls: r.max_walls };
  }
  return rules;
}

export interface SurfaceConfig {
  presets: { id: string; label: string }[];
  generate: ModelRef & { prompt: string; subject_photo: string };
  size_px: number;
  blend_edges: number;
  tone: { saturation: number; contrast: number };
  prompt_max_chars: number;
  stale_seconds: number;
}

let surfaces: SurfaceConfig | null = null;
export function surfaceConfig(): SurfaceConfig {
  surfaces ??= read('surfaces.json') as SurfaceConfig;
  return surfaces;
}

// Ids of the preset files; `plain` means no texture at all.
export const presetIds = () => surfaceConfig().presets.map((p) => p.id).filter((id) => id !== 'plain');
