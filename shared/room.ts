// The room layout as data, shared by the server tools (editWalls, makeSurface) and the client.
// Grid points are counted from the back corner of the default room: point (0, 0) is where the two
// back walls meet. A wall is one 1 m segment on a grid line:
//   [i, j, 'x'] runs from point (i, j) to (i + 1, j)
//   [i, j, 'z'] runs from point (i, j) to (i, j + 1)
// The numbers (heights, limits) come from config/camera.json `room` and are passed in.

export type Axis = 'x' | 'z';
export type Edge = [number, number, Axis];
export type WallHeight = number | 'backdrop';

export interface Wall {
  edge: Edge;
  height: WallHeight;
  texture?: string; // overrides room.wall_texture for this segment
}

export interface Room {
  walls: Wall[];
  floor_texture?: string;
  wall_texture?: string; // every wall without its own texture
}

export type WallOp =
  | { op: 'add'; edge: Edge; height?: WallHeight }
  | { op: 'remove'; edge: Edge }
  | { op: 'height'; edge: Edge; height: WallHeight };

export interface RoomRules {
  size: [number, number]; // default room, m
  heights: Record<string, number>; // low / normal / tall
  gridLimits: [number, number]; // min and max grid point on both axes
  maxWalls: number;
}

export const MAX_OPS = 50;

export class RoomError extends Error {}

export const edgeId = ([i, j, a]: Edge) => `${a}:${i}:${j}`;

export function parseEdgeId(id: string): Edge | null {
  const m = /^(x|z):(-?\d+):(-?\d+)$/.exec(id);
  return m ? [Number(m[2]), Number(m[3]), m[1] as Axis] : null;
}

const sameEdge = (a: Edge, b: Edge) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// The two back edges of the default room, as backdrops.
export function defaultRoom(rules: RoomRules): Room {
  const [w, d] = rules.size;
  const walls: Wall[] = [];
  for (let i = 0; i < w; i++) walls.push({ edge: [i, 0, 'x'], height: 'backdrop' });
  for (let j = 0; j < d; j++) walls.push({ edge: [0, j, 'z'], height: 'backdrop' });
  return { walls };
}

export function checkEdge(edge: unknown, rules: RoomRules): Edge {
  if (!Array.isArray(edge) || edge.length !== 3) throw new RoomError('bad wall edge');
  const [i, j, a] = edge;
  const [lo, hi] = rules.gridLimits;
  if (!Number.isInteger(i) || !Number.isInteger(j) || (a !== 'x' && a !== 'z')) throw new RoomError('bad wall edge');
  // the whole segment must stay inside the 12 x 12 m room limit
  const [i2, j2] = a === 'x' ? [i + 1, j] : [i, j + 1];
  if (Math.min(i, j) < lo || Math.max(i2, j2) > hi) throw new RoomError('that is outside the room');
  return [i, j, a];
}

export function checkHeight(height: unknown, rules: RoomRules): WallHeight {
  if (height === 'backdrop') return height;
  if (typeof height === 'number' && Object.values(rules.heights).some((h) => Math.abs(h - height) < 1e-6)) return height;
  throw new RoomError('bad wall height');
}

// Applies wall ops in order. Returns a new room; throws RoomError for anything invalid.
export function applyWallOps(room: Room, ops: unknown, rules: RoomRules): Room {
  if (!Array.isArray(ops) || ops.length === 0) throw new RoomError('nothing to change');
  if (ops.length > MAX_OPS) throw new RoomError('too many changes at once');
  const walls = room.walls.map((w) => ({ ...w, edge: [...w.edge] as Edge }));
  for (const raw of ops) {
    const op = raw as Record<string, unknown>;
    const edge = checkEdge(op.edge, rules);
    const at = walls.findIndex((w) => sameEdge(w.edge, edge));
    if (op.op === 'add') {
      const height = op.height === undefined ? rules.heights.normal : checkHeight(op.height, rules);
      if (at >= 0) continue; // already a wall there
      if (walls.length >= rules.maxWalls) throw new RoomError('that is the most walls a room can have');
      walls.push({ edge, height });
    } else if (op.op === 'remove') {
      if (at >= 0) walls.splice(at, 1);
    } else if (op.op === 'height') {
      if (at < 0) throw new RoomError('no wall there');
      walls[at].height = checkHeight(op.height, rules);
    } else {
      throw new RoomError('unknown wall change');
    }
  }
  return { ...room, walls };
}

// What a surface can be put on.
export type SurfaceTarget = 'floor' | 'all_walls' | string; // or a wall segment id like "x:3:0"

// Sets (or clears, with null) a texture. `all_walls` also clears per-segment textures so every
// wall, including ones added later, uses it.
export function setTexture(room: Room, target: SurfaceTarget, texture: string | null): Room {
  const next: Room = { ...room, walls: room.walls.map((w) => ({ ...w })) };
  const value = texture ?? undefined;
  if (target === 'floor') next.floor_texture = value;
  else if (target === 'all_walls') {
    next.wall_texture = value;
    next.walls.forEach((w) => delete w.texture);
  } else {
    const edge = parseEdgeId(target);
    const wall = edge && next.walls.find((w) => sameEdge(w.edge, edge));
    if (!wall) throw new RoomError('no wall there');
    wall.texture = value;
  }
  for (const w of next.walls) if (w.texture === undefined) delete w.texture;
  if (next.floor_texture === undefined) delete next.floor_texture;
  if (next.wall_texture === undefined) delete next.wall_texture;
  return next;
}

export function checkTarget(target: unknown, room: Room): SurfaceTarget {
  if (target === 'floor' || target === 'all_walls') return target;
  if (typeof target === 'string') {
    const edge = parseEdgeId(target);
    if (edge && room.walls.some((w) => sameEdge(w.edge, edge))) return target;
  }
  throw new RoomError('pick the floor or a wall');
}

// A texture is a preset (`preset:asphalt`) or a file the player made (`{user_id}/surfaces/...`).
export function validTexture(ref: unknown, userId: string | null, presets: string[]): ref is string {
  if (typeof ref !== 'string') return false;
  if (ref.startsWith('preset:')) return presets.includes(ref.slice(7));
  return userId !== null && ref.startsWith(`${userId}/surfaces/`) && /^[0-9a-f-]{36}\/surfaces\/[0-9a-f-]{36}\.(jpg|png)$/i.test(ref);
}

// Reads whatever is stored (or nothing) into a clean room. Drops anything it does not trust, so a
// hand-edited row can never point a texture at another player's files.
export function parseRoom(value: unknown, rules: RoomRules, userId: string | null, presets: string[]): Room {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Room).walls)) return defaultRoom(rules);
  const v = value as Room;
  const walls: Wall[] = [];
  for (const w of v.walls.slice(0, rules.maxWalls)) {
    try {
      const edge = checkEdge(w?.edge, rules);
      if (walls.some((x) => sameEdge(x.edge, edge))) continue;
      const wall: Wall = { edge, height: checkHeight(w.height, rules) };
      if (validTexture(w.texture, userId, presets)) wall.texture = w.texture;
      walls.push(wall);
    } catch {
      // skip a broken segment, keep the rest
    }
  }
  const room: Room = { walls };
  if (validTexture(v.floor_texture, userId, presets)) room.floor_texture = v.floor_texture;
  if (validTexture(v.wall_texture, userId, presets)) room.wall_texture = v.wall_texture;
  return room;
}

// World position of a grid point, m. The default room is centered on the origin.
export function gridToWorld(i: number, j: number, rules: Pick<RoomRules, 'size'>): [number, number] {
  return [i - rules.size[0] / 2, j - rules.size[1] / 2];
}

// Neighbouring segments on one line with the same look, drawn as one box.
export interface WallRun {
  axis: Axis;
  line: number; // j for 'x' runs, i for 'z' runs
  from: number; // first grid index along the run
  to: number; // one past the last
  height: WallHeight;
  texture?: string;
  edges: Edge[];
}

export function wallRuns(walls: Wall[], look: (w: Wall) => { height: WallHeight; texture?: string }): WallRun[] {
  const sorted = walls
    .map((w) => ({ w, ...look(w) }))
    .sort((a, b) => {
      const [ai, aj, aa] = a.w.edge;
      const [bi, bj, ba] = b.w.edge;
      if (aa !== ba) return aa < ba ? -1 : 1;
      const [al, ap] = aa === 'x' ? [aj, ai] : [ai, aj];
      const [bl, bp] = ba === 'x' ? [bj, bi] : [bi, bj];
      return al - bl || ap - bp;
    });
  const runs: WallRun[] = [];
  for (const s of sorted) {
    const [i, j, axis] = s.w.edge;
    const [line, pos] = axis === 'x' ? [j, i] : [i, j];
    const last = runs.at(-1);
    if (last && last.axis === axis && last.line === line && last.to === pos && last.height === s.height && last.texture === s.texture) {
      last.to = pos + 1;
      last.edges.push(s.w.edge);
    } else {
      runs.push({ axis, line, from: pos, to: pos + 1, height: s.height, texture: s.texture, edges: [s.w.edge] });
    }
  }
  return runs;
}
