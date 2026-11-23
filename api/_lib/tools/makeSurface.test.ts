import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const files = new Map<string, Buffer>();
let ids = 0;

// Just enough of the supabase client for editWalls and makeSurface.
function from(table: string) {
  const filters: [string, unknown][] = [];
  let action: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  let payload: Row = {};
  let mode: 'many' | 'single' | 'maybe' = 'many';
  const rows = () => (tables[table] ??= []);
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => (filters.push([k, v]), q),
    insert: (p: Row) => ((action = 'insert'), (payload = p), q),
    update: (p: Row) => ((action = 'update'), (payload = p), q),
    upsert: (p: Row) => ((action = 'upsert'), (payload = p), q),
    single: () => ((mode = 'single'), q),
    maybeSingle: () => ((mode = 'maybe'), q),
    then: (resolve: (v: unknown) => void) => {
      let data: Row[] = [];
      let error: { message: string; code?: string } | null = null;
      if (action === 'select') data = rows().filter(match);
      else if (action === 'insert') {
        const clash = table === 'ssx_jobs' && rows().some((r) => r.user_id === payload.user_id && r.kind === payload.kind && r.status === 'working');
        if (clash) error = { message: 'duplicate', code: '23505' };
        else {
          const row = { id: `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`, status: 'working', state: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
          rows().push(row);
          data = [row];
        }
      } else if (action === 'update') {
        data = rows().filter(match);
        data.forEach((r) => Object.assign(r, payload));
      } else {
        const existing = rows().find((r) => r.user_id === payload.user_id);
        if (existing) Object.assign(existing, payload);
        else rows().push({ ...payload });
      }
      resolve({ data: mode === 'many' ? data : (data[0] ?? null), error });
    },
  };
  return q;
}

const storage = {
  from: () => ({
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }),
    upload: async (path: string, bytes: Buffer) => (files.set(path, bytes), { error: null }),
  }),
};

vi.mock('../http.js', async (original) => ({
  ...(await original<typeof import('../http.js')>()),
  admin: () => ({ from, storage }),
  walletTotal: async (uid: string) => (tables.ssx_ledger ?? []).filter((r) => r.user_id === uid).reduce((a, r) => a + (r.delta as number), 0),
}));

const predictions = new Map<string, { status: string; output?: string }>();
const started: Record<string, unknown>[] = [];
vi.mock('../replicate.js', async (original) => ({
  ...(await original<typeof import('../replicate.js')>()),
  startPrediction: async (_ref: unknown, input: Record<string, unknown>) => {
    const id = `pred-${started.length + 1}`;
    started.push(input);
    predictions.set(id, { status: 'processing' });
    return { id, status: 'starting' };
  },
  getPrediction: async (id: string) => ({ id, ...predictions.get(id) }),
  download: async () => ({
    bytes: await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 90, g: 90, b: 95 } } }).png().toBuffer(),
    type: 'image/png',
  }),
}));

const { editWalls, loadRoom } = await import('./editWalls.js');
const { advanceSurfaceJob, makeSurface } = await import('./makeSurface.js');

const U = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  files.clear();
  predictions.clear();
  started.length = 0;
  ids = 0;
  tables.ssx_profiles = [{ user_id: U, room: null }];
  tables.ssx_ledger = [{ user_id: U, delta: 20, reason: 'base' }];
});

describe('editWalls', () => {
  it('saves wall changes on the profile and turns bad ones into a readable error', async () => {
    expect((await loadRoom(U)).walls).toHaveLength(12);
    const room = await editWalls({ userId: U, ops: [{ op: 'add', edge: [2, 3, 'z'] }, { op: 'remove', edge: [0, 0, 'z'] }] });
    expect(room.walls).toHaveLength(12);
    expect((tables.ssx_profiles[0].room as { walls: unknown[] }).walls).toHaveLength(12);
    await expect(editWalls({ userId: U, ops: [{ op: 'add', edge: [40, 0, 'x'] }] })).rejects.toThrow('outside');
  });
});

describe('makeSurface', () => {
  it('applies a preset for free', async () => {
    const result = await makeSurface({ userId: U, target: 'floor', preset: 'asphalt' });
    expect('room' in result && result.room.floor_texture).toBe('preset:asphalt');
    await makeSurface({ userId: U, target: 'all_walls', preset: 'siding' });
    expect((await loadRoom(U)).wall_texture).toBe('preset:siding');
    expect(tables.ssx_ledger).toHaveLength(1);
    await expect(makeSurface({ userId: U, target: 'floor', preset: 'lava' })).rejects.toThrow('no such surface');
    await expect(makeSurface({ userId: U, target: 'x:4:4', preset: 'wood' })).rejects.toThrow('floor or a wall');
  });

  it('describes a texture, then charges costs.surface only once it exists', async () => {
    const start = await makeSurface({ userId: U, target: 'x:2:0', prompt: 'old  red   brick' });
    expect('jobId' in start && start.cost).toBe(5);
    expect(String(started[0].prompt)).toMatch(/^Seamless tileable texture of old red brick, seen straight on/);
    expect(started[0].image_input).toBeUndefined();
    const jobId = (start as { jobId: string }).jobId;
    expect((await advanceSurfaceJob(U, jobId)).status).toBe('working');
    expect(tables.ssx_ledger).toHaveLength(1);

    predictions.set('pred-1', { status: 'succeeded', output: 'https://replicate/t.png' });
    const done = await advanceSurfaceJob(U, jobId);
    expect(done.status).toBe('done');
    const path = `${U}/surfaces/${jobId}.jpg`;
    expect(files.has(path)).toBe(true);
    expect(done.room?.walls.find((w) => w.edge.join() === '2,0,x')?.texture).toBe(path);
    expect(tables.ssx_ledger.at(-1)).toMatchObject({ delta: -5, reason: 'surface' });
  });

  it('sends the photo with the photo prompt, one job at a time, and checks cubes', async () => {
    await makeSurface({ userId: U, target: 'floor', photoUrl: 'https://signed/p.jpg' });
    expect(started[0].image_input).toEqual(['https://signed/p.jpg']);
    expect(String(started[0].prompt)).toContain('the surface in the photo');
    await expect(makeSurface({ userId: U, target: 'floor', prompt: 'grass' })).rejects.toThrow('already making');

    tables.ssx_jobs = [];
    tables.ssx_ledger = [{ user_id: U, delta: 2, reason: 'base' }];
    await expect(makeSurface({ userId: U, target: 'floor', prompt: 'grass' })).rejects.toThrow('not enough cubes');
    await expect(makeSurface({ userId: U, target: 'floor' })).rejects.toThrow('add a photo');
  });

  it('a failed generation costs nothing', async () => {
    const start = (await makeSurface({ userId: U, target: 'floor', prompt: 'sand' })) as { jobId: string };
    predictions.set('pred-1', { status: 'failed' });
    const v = await advanceSurfaceJob(U, start.jobId);
    expect(v.status).toBe('failed');
    expect(v.error).toContain('no cubes spent');
    expect(tables.ssx_ledger).toHaveLength(1);
  });
});
