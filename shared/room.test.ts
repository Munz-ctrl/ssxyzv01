import { describe, expect, it } from 'vitest';
import {
  applyWallOps,
  checkTarget,
  defaultRoom,
  edgeId,
  parseRoom,
  setTexture,
  wallRuns,
  type Room,
  type RoomRules,
} from './room.js';

const rules: RoomRules = { size: [6, 6], heights: { low: 1, normal: 2.7, tall: 4 }, gridLimits: [-3, 9], maxWalls: 200 };
const U = '11111111-1111-4111-8111-111111111111';
const presets = ['asphalt', 'siding'];

describe('room', () => {
  it('starts with the two back edges as backdrops', () => {
    const room = defaultRoom(rules);
    expect(room.walls).toHaveLength(12);
    expect(room.walls.every((w) => w.height === 'backdrop')).toBe(true);
    expect(room.walls.filter((w) => w.edge[2] === 'x').every((w) => w.edge[1] === 0)).toBe(true);
    expect(room.walls.filter((w) => w.edge[2] === 'z').every((w) => w.edge[0] === 0)).toBe(true);
  });

  it('adds, removes and resizes segments', () => {
    let room = applyWallOps(defaultRoom(rules), [{ op: 'add', edge: [2, 4, 'x'] }], rules);
    expect(room.walls.at(-1)).toEqual({ edge: [2, 4, 'x'], height: 2.7 });
    room = applyWallOps(room, [{ op: 'height', edge: [2, 4, 'x'], height: 4 }, { op: 'remove', edge: [0, 0, 'x'] }], rules);
    expect(room.walls.find((w) => edgeId(w.edge) === 'x:2:4')?.height).toBe(4);
    expect(room.walls.some((w) => edgeId(w.edge) === 'x:0:0')).toBe(false);
    expect(room.walls).toHaveLength(12);
    // adding twice is a no-op
    expect(applyWallOps(room, [{ op: 'add', edge: [2, 4, 'x'] }], rules).walls).toHaveLength(12);
  });

  it('refuses bad edges, heights and the 12 x 12 m limit', () => {
    const room = defaultRoom(rules);
    expect(() => applyWallOps(room, [{ op: 'add', edge: [1.5, 0, 'x'] }], rules)).toThrow('bad wall edge');
    expect(() => applyWallOps(room, [{ op: 'add', edge: [1, 0, 'y'] }], rules)).toThrow('bad wall edge');
    expect(() => applyWallOps(room, [{ op: 'add', edge: [8, 0, 'x'] }], rules)).not.toThrow();
    expect(() => applyWallOps(room, [{ op: 'add', edge: [9, 0, 'x'] }], rules)).toThrow('outside');
    expect(() => applyWallOps(room, [{ op: 'add', edge: [-4, 0, 'z'] }], rules)).toThrow('outside');
    expect(() => applyWallOps(room, [{ op: 'add', edge: [1, 1, 'x'], height: 3 }], rules)).toThrow('height');
    expect(() => applyWallOps(room, [{ op: 'height', edge: [3, 3, 'x'], height: 1 }], rules)).toThrow('no wall');
    expect(() => applyWallOps(room, [], rules)).toThrow('nothing');
    expect(() => applyWallOps(room, [{ op: 'paint', edge: [0, 0, 'x'] }], rules)).toThrow('unknown');
  });

  it('textures one wall, all walls, or the floor', () => {
    let room = setTexture(defaultRoom(rules), 'x:1:0', 'preset:siding');
    expect(room.walls.find((w) => edgeId(w.edge) === 'x:1:0')?.texture).toBe('preset:siding');
    room = setTexture(room, 'all_walls', 'preset:asphalt');
    expect(room.wall_texture).toBe('preset:asphalt');
    expect(room.walls.some((w) => w.texture)).toBe(false);
    room = setTexture(room, 'floor', 'preset:asphalt');
    expect(room.floor_texture).toBe('preset:asphalt');
    room = setTexture(room, 'floor', null);
    expect('floor_texture' in room).toBe(false);
    expect(() => checkTarget('x:3:3', room)).toThrow();
    expect(checkTarget('z:0:2', room)).toBe('z:0:2');
  });

  it('only trusts textures that are presets or the same player files', () => {
    const stored = {
      walls: [
        { edge: [0, 0, 'x'], height: 'backdrop', texture: `${U}/surfaces/22222222-2222-4222-8222-222222222222.jpg` },
        { edge: [1, 0, 'x'], height: 2.7, texture: '33333333-3333-4333-8333-333333333333/surfaces/22222222-2222-4222-8222-222222222222.jpg' },
        { edge: [1, 0, 'x'], height: 4 }, // duplicate
        { edge: [99, 0, 'x'], height: 2.7 }, // outside
        { edge: [2, 0, 'x'], height: 2 }, // bad height
      ],
      floor_texture: 'preset:lava',
      wall_texture: 'preset:siding',
    };
    const room = parseRoom(stored, rules, U, presets);
    expect(room.walls).toHaveLength(2);
    expect(room.walls[0].texture).toContain(U);
    expect(room.walls[1].texture).toBeUndefined();
    expect(room.floor_texture).toBeUndefined();
    expect(room.wall_texture).toBe('preset:siding');
    expect(parseRoom(null, rules, U, presets)).toEqual(defaultRoom(rules));
  });

  it('draws neighbouring segments with the same look as one run', () => {
    const room: Room = applyWallOps(defaultRoom(rules), [{ op: 'height', edge: [3, 0, 'x'], height: 1 }], rules);
    const runs = wallRuns(room.walls, (w) => ({ height: w.height }));
    const xs = runs.filter((r) => r.axis === 'x').map((r) => [r.from, r.to, r.height]);
    expect(xs).toEqual([
      [0, 3, 'backdrop'],
      [3, 4, 1],
      [4, 6, 'backdrop'],
    ]);
    expect(runs.filter((r) => r.axis === 'z')).toHaveLength(1);
  });
});
