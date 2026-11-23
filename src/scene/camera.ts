import cam from '../../config/camera.json';
import type { Edge, RoomRules } from '../../shared/room';

// Every camera, scale and room number comes from config/camera.json.

const RAD = Math.PI / 180;
export const YAW = cam.yaw_deg * RAD;
export const TILT = -cam.tilt_deg * RAD; // config says -33 (looking down); this is the positive downward angle

export const ROOM = {
  width: cam.room.size_m[0],
  depth: cam.room.size_m[1],
  wallHeight: cam.room.wall_height_m,
  wallThickness: cam.room.wall_thickness_m,
  wallColor: cam.room.wall_color,
  cutawayHeight: cam.room.cutaway_height_m,
};

// The same numbers the server tools use (shared/room.ts).
export const ROOM_RULES: RoomRules = {
  size: cam.room.size_m as [number, number],
  heights: cam.room.wall_heights_m,
  gridLimits: cam.room.grid_limits as [number, number],
  maxWalls: cam.room.max_walls,
};

export const MOVES = cam.moves;

export const FLOOR = cam.floor;

export const PROXY = { width: cam.player_proxy_m[0], depth: cam.player_proxy_m[1], height: cam.player_proxy_m[2] };

// CSS pixels per meter. Portrait when width <= height.
export function pxPerMeter(width: number, height: number): number {
  const p = width <= height ? cam.px_per_meter.portrait : cam.px_per_meter.landscape;
  return (width * p.value) / p.at_width;
}

// Unit vector from the target toward the camera: yaw around the vertical axis, tilted down.
export function cameraDirection(): [number, number, number] {
  const flat = Math.cos(TILT);
  return [flat * Math.sin(YAW), Math.sin(TILT), flat * Math.cos(YAW)];
}

// Screen space (x right, y up) of a world point under this camera, in meters. Used for checks.
export function project([x, y, z]: [number, number, number]): [number, number] {
  const [dx, dy, dz] = cameraDirection();
  // right = up(0,1,0) x forward(toward camera), normalized; up' = forward x right
  const rx = dz, rz = -dx;
  const rl = Math.hypot(rx, rz);
  const right: [number, number, number] = [rx / rl, 0, rz / rl];
  const up: [number, number, number] = [
    dy * right[2] - dz * right[1],
    dz * right[0] - dx * right[2],
    dx * right[1] - dy * right[0],
  ];
  return [x * right[0] + y * right[1] + z * right[2], x * up[0] + y * up[1] + z * up[2]];
}

// The floor point (y = 0) under a screen point given in meters from the screen center at 1x.
export function floorFromScreen([sx, sy]: [number, number]): [number, number] {
  const [ax, ay] = project([1, 0, 0]);
  const [bx, by] = project([0, 0, 1]);
  const det = ax * by - bx * ay;
  return [(sx * by - bx * sy) / det, (ax * sy - sx * ay) / det];
}

// How tall a wall standing on these floor points must be for its top to pass the top of the
// screen at 1x (`topM` = half the screen height in meters). Zoom and pan never show more than 1x.
export function backdropHeight(points: [number, number][], topM: number, margin = 0.5): number {
  const [, uy] = project([0, 1, 0]);
  const need = Math.max(...points.map(([x, z]) => (topM - project([x, 0, z])[1]) / uy));
  return Math.max(ROOM.wallHeight, need + margin);
}

// Screen angle of a floor line in degrees (expect about 28.5).
export function floorLineAngle(): number {
  const [x, y] = project([1, 0, 0]);
  return Math.atan2(Math.abs(y), Math.abs(x)) / RAD;
}

// Room tiles are counted from the back corner: tile (0, 0) touches both walls.
export function tileCenter(i: number, j: number): [number, number] {
  return [i - ROOM.width / 2 + 0.5, j - ROOM.depth / 2 + 0.5];
}

export const AVATAR = cam.avatar;

// Zoom and pan. Pan is the screen center in meters (screen axes, 1x frame). At zoom z the view
// is 1/z of the 1x frame and must stay inside it, so the bake framing is never left.
export function panLimit(z: number, halfW: number, halfH: number): [number, number] {
  const k = Math.max(0, 1 - 1 / Math.max(z, 1));
  return [halfW * k, halfH * k];
}

export function clampView(z: number, pan: [number, number], halfW: number, halfH: number) {
  const zoom = Math.min(MOVES.max_zoom, Math.max(MOVES.min_zoom, z));
  const [lx, ly] = panLimit(zoom, halfW, halfH);
  return { zoom, pan: [Math.max(-lx, Math.min(lx, pan[0])), Math.max(-ly, Math.min(ly, pan[1]))] as [number, number] };
}

// Past a limit a gesture only moves a third as far, then eases back on release.
export function rubber(value: number, min: number, max: number): number {
  if (value < min) return min - (min - value) / 3;
  if (value > max) return max + (value - max) / 3;
  return value;
}

// The avatar is a vertical plane facing the camera. Its person spans person_height_px of the
// canvas and must stand person_height_m tall, so the full plane is canvas / person * height.
export function avatarPlane() {
  const [cw, ch] = AVATAR.canvas_px;
  const [ax, ay] = AVATAR.anchor_px;
  const height = (ch / AVATAR.person_height_px) * AVATAR.person_height_m;
  const width = (height * cw) / ch;
  // offset of the plane center from the feet anchor, in plane space (y up)
  return { width, height, offsetX: (0.5 - ax / cw) * width, offsetY: (ay / ch - 0.5) * height };
}

// What a tap in the room landed on.
export type ScenePick = { kind: 'avatar' } | { kind: 'floor' } | { kind: 'edge'; edge: Edge } | { kind: 'none' };

// A floor tap near a grid line picks that 1 m segment; anywhere else picks the floor.
export function pickOnFloor(x: number, z: number, toleranceM: number): ScenePick {
  const gx = x + ROOM_RULES.size[0] / 2;
  const gz = z + ROOM_RULES.size[1] / 2;
  const dx = Math.abs(gx - Math.round(gx));
  const dz = Math.abs(gz - Math.round(gz));
  const tol = Math.min(toleranceM, 0.3);
  const [lo, hi] = ROOM_RULES.gridLimits;
  let edge: Edge | null = null;
  if (dx <= dz && dx < tol) edge = [Math.round(gx), Math.floor(gz), 'z'];
  else if (dz < tol) edge = [Math.floor(gx), Math.round(gz), 'x'];
  if (edge) {
    const end = edge[2] === 'x' ? [edge[0] + 1, edge[1]] : [edge[0], edge[1] + 1];
    if (Math.min(edge[0], edge[1]) >= lo && Math.max(...end) <= hi) return { kind: 'edge', edge };
  }
  return { kind: 'floor' };
}
