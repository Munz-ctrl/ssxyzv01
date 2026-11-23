import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { HEIGHT_RANGE_M } from '../../../shared/height.js';
import { admin, must, walletTotal } from '../http.js';
import { download, getPrediction, outputUrl, startPrediction } from '../replicate.js';
import { loadRules } from '../rules.js';
import { avatarConfig } from './avatarConfig.js';
import { normalizeAvatar } from './normalizeAvatar.js';

// The avatar maker as plain functions. /api/avatar calls them for the player; the agent can call
// the same ones later. Generation is async: createAvatar starts a job, advanceAvatarJob moves it
// one step each time the client polls, so no call runs long.

export const BUCKET = 'ssx';
const KIND = 'avatar';
const SIGNED_SECONDS = 60 * 60;
const MAX_JOB_MINUTES = 15;

// A failure the player should read. Everything else is logged and shown as a generic line.
export class AvatarError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

interface JobRow {
  id: string;
  user_id: string;
  status: 'working' | 'done' | 'failed';
  step: string;
  input: { height_m: number; cost: number; photo_paths?: string[]; previous_avatar_id: string | null };
  state: { generate_id?: string; cutout_id?: string; raw_path?: string };
  output: { avatar_id?: string } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobView {
  id: string;
  status: JobRow['status'];
  step: string;
  error?: string;
  avatar?: { id: string; url: string; height_m: number };
}

// First avatar is free, every one after costs `costs.avatar_change`.
export async function avatarPrice(userId: string): Promise<{ cost: number; free: boolean }> {
  const { count, error } = await admin().from('ssx_avatars').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw new Error(`avatar count: ${error.message}`);
  const free = (count ?? 0) === 0;
  return { free, cost: free ? 0 : loadRules().costs.avatar_change };
}

export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error || !data) throw new Error(`sign ${path}: ${error?.message}`);
  return data.signedUrl;
}

async function upload(path: string, bytes: Buffer, contentType: string) {
  const { error } = await admin().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

// The camera guides go to storage once so Replicate can fetch them.
const guideCache = new Map<string, string>();
async function guideUrls(): Promise<string[]> {
  return Promise.all(
    avatarConfig().generate.guides.map(async (file) => {
      const path = `_refs/${basename(file)}`;
      if (!guideCache.has(path)) {
        const exists = await admin().storage.from(BUCKET).createSignedUrl(path, 60);
        if (exists.error) await upload(path, readFileSync(join(process.cwd(), file)), 'image/png');
        guideCache.set(path, path);
      }
      return signedUrl(path);
    }),
  );
}

export function checkHeight(heightM: number) {
  const { min, max } = HEIGHT_RANGE_M;
  if (!Number.isFinite(heightM) || heightM < min || heightM > max) {
    throw new AvatarError(`height must be between ${min} and ${max} m`);
  }
}

export async function createAvatar(args: {
  userId: string;
  photoUrls: string[];
  heightM: number;
  photoPaths?: string[];
}): Promise<{ jobId: string; cost: number }> {
  const { userId, photoUrls, heightM } = args;
  const cfg = avatarConfig();
  if (photoUrls.length < cfg.photos.min || photoUrls.length > cfg.photos.max) {
    throw new AvatarError(`add ${cfg.photos.min} to ${cfg.photos.max} photos`);
  }
  checkHeight(heightM);

  const { cost } = await avatarPrice(userId);
  if (cost > 0 && (await walletTotal(userId)) < cost) throw new AvatarError(`not enough cubes. this costs ${cost} 🧊`, 402);

  const db = admin();
  const profile = must(
    await db.from('ssx_profiles').select('active_avatar_id').eq('user_id', userId).maybeSingle(),
    'profile',
  ) as { active_avatar_id: string | null } | null;

  // the unique index allows one working avatar job per player
  const inserted = await db
    .from('ssx_jobs')
    .insert({
      user_id: userId,
      kind: KIND,
      step: 'generating',
      input: { height_m: heightM, cost, photo_paths: args.photoPaths ?? [], previous_avatar_id: profile?.active_avatar_id ?? null },
    })
    .select('id')
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') throw new AvatarError('already making one. hang on.', 409);
    throw new Error(`insert job: ${inserted.error.message}`);
  }
  const jobId = (inserted.data as { id: string }).id;

  try {
    const g = cfg.generate;
    const prediction = await startPrediction(g, { prompt: g.prompt, image_input: [...(await guideUrls()), ...photoUrls] });
    await update(jobId, { state: { generate_id: prediction.id } });
  } catch (err) {
    await fail(jobId, err);
    throw err;
  }
  return { jobId, cost };
}

async function update(jobId: string, fields: Partial<JobRow>, whereStep?: string): Promise<boolean> {
  let q = admin()
    .from('ssx_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'working');
  if (whereStep) q = q.eq('step', whereStep);
  const rows = must(await q.select('id'), 'update job') as { id: string }[];
  return rows.length > 0;
}

async function fail(jobId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[avatar] job failed:', message.slice(0, 300));
  await update(jobId, { status: 'failed', error: message.slice(0, 500) }).catch(() => {});
}

async function loadJob(userId: string, jobId: string): Promise<JobRow> {
  const job = must(
    await admin().from('ssx_jobs').select('*').eq('id', jobId).eq('user_id', userId).eq('kind', KIND).maybeSingle(),
    'load job',
  ) as JobRow | null;
  if (!job) throw new AvatarError('no such job', 404);
  return job;
}

async function view(job: JobRow): Promise<JobView> {
  const v: JobView = { id: job.id, status: job.status, step: job.step };
  if (job.status === 'failed') v.error = 'that did not work. no cubes spent. try again.';
  if (job.status === 'done' && job.output?.avatar_id) {
    const row = must(
      await admin().from('ssx_avatars').select('id, image_path, height_m').eq('id', job.output.avatar_id).single(),
      'avatar',
    ) as { id: string; image_path: string; height_m: number };
    v.avatar = { id: row.id, url: await signedUrl(row.image_path), height_m: Number(row.height_m) };
  }
  return v;
}

// Moves a working job forward by at most one step and reports where it stands.
export async function advanceAvatarJob(userId: string, jobId: string): Promise<JobView> {
  let job = await loadJob(userId, jobId);
  if (job.status !== 'working') return view(job);

  try {
    const age = (Date.now() - new Date(job.created_at).getTime()) / 60000;
    const idle = (Date.now() - new Date(job.updated_at).getTime()) / 1000;
    if (age > MAX_JOB_MINUTES) throw new Error('job timed out');
    // a step claimed by a call that then died
    const claimed = (job.step === 'cutting' && !job.state.cutout_id) || job.step === 'normalizing';
    if (claimed && idle > avatarConfig().stale_seconds) throw new Error(`stuck in ${job.step}`);

    if (job.step === 'generating' && job.state.generate_id) await afterGenerate(job);
    else if (job.step === 'cutting' && job.state.cutout_id) await afterCutout(job);
  } catch (err) {
    await fail(job.id, err);
  }
  job = await loadJob(userId, jobId);
  return view(job);
}

async function finished(id: string): Promise<string | null> {
  const p = await getPrediction(id);
  if (p.status === 'failed' || p.status === 'canceled') throw new Error(`prediction ${p.status}: ${String(p.error ?? '')}`);
  if (p.status !== 'succeeded') return null;
  const url = outputUrl(p.output);
  if (!url) throw new Error('prediction had no output');
  return url;
}

async function afterGenerate(job: JobRow) {
  const url = await finished(job.state.generate_id!);
  if (!url || !(await update(job.id, { step: 'cutting' }, 'generating'))) return;

  // keep the paid generation so we can re-normalize later without paying again
  const raw = await download(url);
  const rawPath = `${job.user_id}/avatars/${job.id}-raw.${raw.type.includes('jpeg') ? 'jpg' : 'png'}`;
  await upload(rawPath, raw.bytes, raw.type);

  const c = avatarConfig().cutout;
  const prediction = await startPrediction(c, { [c.image_field]: url });
  await update(job.id, { state: { ...job.state, raw_path: rawPath, cutout_id: prediction.id } });
}

async function afterCutout(job: JobRow) {
  const url = await finished(job.state.cutout_id!);
  if (!url || !(await update(job.id, { step: 'normalizing' }, 'cutting'))) return;

  const db = admin();
  const userId = job.user_id;
  const cut = await download(url);
  const cutoutPath = `${userId}/avatars/${job.id}-cutout.png`;
  await upload(cutoutPath, cut.bytes, cut.type);

  const { png } = await normalizeAvatar(cut.bytes, job.input.height_m);
  const avatarId = randomUUID();
  const imagePath = `${userId}/avatars/${avatarId}.png`;
  await upload(imagePath, png, 'image/png');

  const { count } = await db.from('ssx_avatars').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  must(
    await db.from('ssx_avatars').insert({
      id: avatarId,
      user_id: userId,
      version: (count ?? 0) + 1,
      image_path: imagePath,
      approved: false,
      height_m: job.input.height_m,
      raw_path: job.state.raw_path ?? null,
      cutout_path: cutoutPath,
      job_id: job.id,
    }),
    'insert avatar',
  );
  must(await db.from('ssx_profiles').upsert({ user_id: userId, active_avatar_id: avatarId }), 'set active avatar');

  // charged only once the avatar exists, so a failed job never costs anything
  if (job.input.cost > 0) {
    must(
      await db.from('ssx_ledger').insert({ user_id: userId, delta: -job.input.cost, reason: 'avatar', rules_version: loadRules().rules_version }),
      'charge avatar',
    );
  }
  await update(job.id, { status: 'done', step: 'done', output: { avatar_id: avatarId } });
}

export async function keepAvatar(userId: string, avatarId: string) {
  must(await admin().from('ssx_avatars').update({ approved: true }).eq('id', avatarId).eq('user_id', userId), 'keep avatar');
}

// "try again": the room goes back to what stood there before this avatar.
export async function discardAvatar(userId: string, avatarId: string) {
  const db = admin();
  const row = must(
    await db.from('ssx_avatars').select('job_id').eq('id', avatarId).eq('user_id', userId).maybeSingle(),
    'avatar',
  ) as { job_id: string | null } | null;
  if (!row) throw new AvatarError('no such avatar', 404);
  let previous: string | null = null;
  if (row.job_id) {
    const job = must(await db.from('ssx_jobs').select('input').eq('id', row.job_id).maybeSingle(), 'job') as Pick<JobRow, 'input'> | null;
    previous = job?.input.previous_avatar_id ?? null;
  }
  must(
    await db.from('ssx_profiles').update({ active_avatar_id: previous }).eq('user_id', userId).eq('active_avatar_id', avatarId),
    'restore avatar',
  );
}
