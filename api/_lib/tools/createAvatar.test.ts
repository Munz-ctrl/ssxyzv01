import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const files = new Map<string, Buffer>();
let ids = 0;

// Just enough of the supabase client for the avatar tool.
function from(table: string) {
  const filters: [string, unknown][] = [];
  let action: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  let payload: Row = {};
  let mode: 'many' | 'single' | 'maybe' = 'many';
  let head = false;
  const rows = () => (tables[table] ??= []);
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
  const q = {
    select: (_c?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
    eq: (k: string, v: unknown) => (filters.push([k, v]), q),
    insert: (p: Row) => ((action = 'insert'), (payload = p), q),
    update: (p: Row) => ((action = 'update'), (payload = p), q),
    upsert: (p: Row) => ((action = 'upsert'), (payload = p), q),
    single: () => ((mode = 'single'), q),
    maybeSingle: () => ((mode = 'maybe'), q),
    then: (resolve: (v: unknown) => void) => {
      let data: Row[] = [];
      let error: { message: string; code?: string } | null = null;
      if (table === 'ssx_wallet') {
        const uid = filters.find(([k]) => k === 'user_id')?.[1];
        const cubes = (tables.ssx_ledger ?? []).filter((r) => r.user_id === uid).reduce((a, r) => a + (r.delta as number), 0);
        data = [{ user_id: uid, cubes }];
      } else if (action === 'select') data = rows().filter(match);
      else if (action === 'insert') {
        const clash =
          table === 'ssx_jobs' && rows().some((r) => r.user_id === payload.user_id && r.kind === payload.kind && r.status === 'working');
        if (clash) error = { message: 'duplicate', code: '23505' };
        else {
          const row = { id: `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`, status: 'working', state: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
          rows().push(row);
          data = [row];
        }
      } else if (action === 'update') {
        data = rows().filter(match);
        data.forEach((r) => Object.assign(r, payload));
      } else if (action === 'upsert') {
        const existing = rows().find((r) => r.user_id === payload.user_id);
        if (existing) Object.assign(existing, payload);
        else rows().push({ ...payload });
      }
      const one = data[0] ?? null;
      resolve({ data: mode === 'many' ? (head ? null : data) : one, count: data.length, error });
    },
  };
  return q;
}

const storage = {
  from: () => ({
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }),
    upload: async (path: string, bytes: Buffer) => (files.set(path, bytes), { error: null }),
    download: async (path: string) =>
      files.has(path) ? { data: new Blob([new Uint8Array(files.get(path)!)]), error: null } : { data: null, error: { message: 'not found' } },
  }),
};

vi.mock('../http.js', async (original) => ({
  ...(await original<typeof import('../http.js')>()),
  admin: () => ({ from, storage }),
  walletTotal: async (uid: string) =>
    (tables.ssx_ledger ?? []).filter((r) => r.user_id === uid).reduce((a, r) => a + (r.delta as number), 0),
}));

// Replicate: each prediction id finishes with a scripted result.
const predictions = new Map<string, { status: string; output?: string }>();
const started: { model: string; input: Record<string, unknown> }[] = [];
vi.mock('../replicate.js', async (original) => ({
  ...(await original<typeof import('../replicate.js')>()),
  startPrediction: async (ref: { model: string }, input: Record<string, unknown>) => {
    const id = `pred-${started.length + 1}`;
    started.push({ model: ref.model, input });
    predictions.set(id, { status: 'processing' });
    return { id, status: 'starting' };
  },
  getPrediction: async (id: string) => ({ id, ...predictions.get(id) }),
  download: async (url: string) => ({ bytes: url.includes('cutout') ? await cutoutPng() : Buffer.from('raw'), type: 'image/png' }),
}));

async function cutoutPng() {
  const w = 300, h = 600;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 50; y < 550; y++) for (let x = 120; x < 180; x++) data.set([80, 60, 50, 255], (y * w + x) * 4);
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const { advanceAvatarJob, createAvatar, discardAvatar, keepAvatar, renormalizeAvatar } = await import('./createAvatar.js');
const { avatarConfig } = await import('./avatarConfig.js');

const U = '11111111-1111-4111-8111-111111111111';
const photos = ['https://signed/photo-1.jpg'];

// Drives a job to the end: generation, then cutout, then normalize.
async function finish(jobId: string) {
  const [gen, cut] = [...predictions.keys()].slice(-1);
  predictions.set(gen, { status: 'succeeded', output: 'https://replicate/gen.png' });
  await advanceAvatarJob(U, jobId); // starts the cutout
  const cutId = [...predictions.keys()].at(-1)!;
  expect(cutId).not.toBe(cut);
  predictions.set(cutId, { status: 'succeeded', output: 'https://replicate/cutout.png' });
  return advanceAvatarJob(U, jobId);
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  files.clear();
  predictions.clear();
  started.length = 0;
  ids = 0;
  tables.ssx_profiles = [{ user_id: U, active_avatar_id: null }];
  tables.ssx_ledger = [{ user_id: U, delta: 50, reason: 'base' }];
});

describe('createAvatar', () => {
  it('sends the guides from config/avatar.json first, then the photos, with its prompt', async () => {
    await createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 });
    const urls = started[0].input.image_input as string[];
    const guides = avatarConfig().generate.guides.map((g) => g.split('/').pop());
    expect(urls.map((u) => u.split('/').pop())).toEqual([...guides, 'photo-1.jpg']);
    expect(started[0].input.prompt).toBe(avatarConfig().generate.prompt);
  });

  it('re-normalizes a saved cutout for free, under a new file name', async () => {
    const { jobId } = await createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 });
    const done = await finish(jobId);
    const before = (tables.ssx_avatars[0].image_path as string);
    const ledger = tables.ssx_ledger.length;
    await renormalizeAvatar(U, done.avatar!.id);
    const after = tables.ssx_avatars[0].image_path as string;
    expect(after).not.toBe(before);
    expect(files.has(after)).toBe(true);
    expect(tables.ssx_ledger).toHaveLength(ledger);
    await expect(renormalizeAvatar('22222222-2222-4222-8222-222222222222', done.avatar!.id)).rejects.toThrow('no such avatar');
  });

  it('makes the first avatar for free, sets it active, and keeps the raw and cutout files', async () => {
    const { jobId, cost } = await createAvatar({ userId: U, photoUrls: photos, heightM: 1.75 });
    expect(cost).toBe(0);
    expect((await advanceAvatarJob(U, jobId)).status).toBe('working');

    const done = await finish(jobId);
    expect(done.status).toBe('done');
    expect(done.avatar?.height_m).toBe(1.75);
    expect(tables.ssx_profiles[0].active_avatar_id).toBe(done.avatar?.id);
    expect([...files.keys()].some((f) => f.endsWith('-raw.png'))).toBe(true);
    expect([...files.keys()].some((f) => f.endsWith('-cutout.png'))).toBe(true);
    expect(tables.ssx_ledger).toHaveLength(1);
  });

  it('charges costs.avatar_change for the second one, after it is made', async () => {
    const first = await createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 });
    const a = await finish(first.jobId);
    await keepAvatar(U, a.avatar!.id);

    const second = await createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 });
    expect(second.cost).toBe(30);
    expect(tables.ssx_ledger).toHaveLength(1);
    const b = await finish(second.jobId);
    expect(tables.ssx_ledger.at(-1)).toMatchObject({ delta: -30, reason: 'avatar' });

    // try again puts the kept one back
    await discardAvatar(U, b.avatar!.id);
    expect(tables.ssx_profiles[0].active_avatar_id).toBe(a.avatar!.id);
  });

  it('a failed generation costs nothing and frees the slot', async () => {
    const { jobId } = await createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 });
    predictions.set('pred-1', { status: 'failed' });
    const v = await advanceAvatarJob(U, jobId);
    expect(v.status).toBe('failed');
    expect(v.error).toContain('no cubes spent');
    await expect(createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 })).resolves.toBeTruthy();
  });

  it('allows one job at a time, checks cubes, height and photo count', async () => {
    await createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 });
    await expect(createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 })).rejects.toThrow('already making one');
    await expect(createAvatar({ userId: U, photoUrls: photos, heightM: 3 })).rejects.toThrow('height');
    await expect(createAvatar({ userId: U, photoUrls: [], heightM: 1.8 })).rejects.toThrow('photos');

    tables.ssx_jobs = [];
    tables.ssx_avatars = [{ id: 'x', user_id: U }];
    tables.ssx_ledger = [{ user_id: U, delta: 10, reason: 'base' }];
    await expect(createAvatar({ userId: U, photoUrls: photos, heightM: 1.8 })).rejects.toThrow('not enough cubes');
  });
});
