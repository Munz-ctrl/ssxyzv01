import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { HEIGHT_RANGE_M } from '../../../shared/height.js';
import { admin, must, walletTotal } from '../http.js';
import {
  BUCKET,
  charge,
  failJob,
  finishedPrediction,
  insertJob,
  jobAge,
  loadJob,
  MAX_JOB_MINUTES,
  readFile,
  signedUrl,
  ToolError,
  updateJob,
  upload,
  type JobRow,
} from '../jobs.js';
import { download, startPrediction } from '../replicate.js';
import { loadRules } from '../rules.js';
import { avatarConfig } from './avatarConfig.js';
import { normalizeAvatar } from './normalizeAvatar.js';

// The avatar maker as plain functions. /api/avatar calls them for the player; the agent can call
// the same ones later. Generation is async: createAvatar starts a job, advanceAvatarJob moves it
// one step each time the client polls, so no call runs long.

export { BUCKET, signedUrl, ToolError as AvatarError };
const KIND = 'avatar';

type AvatarJob = JobRow<
  { height_m: number; cost: number; photo_paths?: string[]; previous_avatar_id: string | null },
  { generate_id?: string; cutout_id?: string; raw_path?: string },
  { avatar_id?: string }
>;

export interface JobView {
  id: string;
  status: AvatarJob['status'];
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
    throw new ToolError(`height must be between ${min} and ${max} m`);
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
    throw new ToolError(`add ${cfg.photos.min} to ${cfg.photos.max} photos`);
  }
  checkHeight(heightM);

  const { cost } = await avatarPrice(userId);
  if (cost > 0 && (await walletTotal(userId)) < cost) throw new ToolError(`not enough cubes. this costs ${cost} 🧊`, 402);

  const profile = must(
    await admin().from('ssx_profiles').select('active_avatar_id').eq('user_id', userId).maybeSingle(),
    'profile',
  ) as { active_avatar_id: string | null } | null;

  const jobId = await insertJob(
    userId,
    KIND,
    'generating',
    { height_m: heightM, cost, photo_paths: args.photoPaths ?? [], previous_avatar_id: profile?.active_avatar_id ?? null },
    'already making one. hang on.',
  );

  try {
    const g = cfg.generate;
    const prediction = await startPrediction(g, { prompt: g.prompt, image_input: [...(await guideUrls()), ...photoUrls] });
    await updateJob(jobId, { state: { generate_id: prediction.id } });
  } catch (err) {
    await failJob(jobId, err, KIND);
    throw err;
  }
  return { jobId, cost };
}

async function view(job: AvatarJob): Promise<JobView> {
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
  let job = await loadJob<AvatarJob>(userId, jobId, KIND);
  if (job.status !== 'working') return view(job);

  try {
    const { minutes, idleSeconds } = jobAge(job);
    if (minutes > MAX_JOB_MINUTES) throw new Error('job timed out');
    // a step claimed by a call that then died
    const claimed = (job.step === 'cutting' && !job.state.cutout_id) || job.step === 'normalizing';
    if (claimed && idleSeconds > avatarConfig().stale_seconds) throw new Error(`stuck in ${job.step}`);

    if (job.step === 'generating' && job.state.generate_id) await afterGenerate(job);
    else if (job.step === 'cutting' && job.state.cutout_id) await afterCutout(job);
  } catch (err) {
    await failJob(job.id, err, KIND);
  }
  job = await loadJob<AvatarJob>(userId, jobId, KIND);
  return view(job);
}

async function afterGenerate(job: AvatarJob) {
  const url = await finishedPrediction(job.state.generate_id!);
  if (!url || !(await updateJob(job.id, { step: 'cutting' }, 'generating'))) return;

  // keep the paid generation so we can re-normalize later without paying again
  const raw = await download(url);
  const rawPath = `${job.user_id}/avatars/${job.id}-raw.${raw.type.includes('jpeg') ? 'jpg' : 'png'}`;
  await upload(rawPath, raw.bytes, raw.type);

  const c = avatarConfig().cutout;
  const prediction = await startPrediction(c, { [c.image_field]: url });
  await updateJob(job.id, { state: { ...job.state, raw_path: rawPath, cutout_id: prediction.id } });
}

async function afterCutout(job: AvatarJob) {
  const url = await finishedPrediction(job.state.cutout_id!);
  if (!url || !(await updateJob(job.id, { step: 'normalizing' }, 'cutting'))) return;

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
  await charge(userId, job.input.cost, 'avatar', loadRules().rules_version);
  await updateJob(job.id, { status: 'done', step: 'done', output: { avatar_id: avatarId } });
}

// Runs the normalizer again on an avatar's saved cutout: no new generation, no cubes.
// Used when the normalize rules change (brief 02d took the baked shadow out).
export async function renormalizeAvatar(userId: string, avatarId: string): Promise<{ url: string }> {
  const db = admin();
  const row = must(
    await db.from('ssx_avatars').select('cutout_path, height_m').eq('id', avatarId).eq('user_id', userId).maybeSingle(),
    'avatar',
  ) as { cutout_path: string | null; height_m: number | null } | null;
  if (!row) throw new ToolError('no such avatar', 404);
  if (!row.cutout_path || !row.height_m) throw new ToolError('this avatar has no saved cutout');

  const { png } = await normalizeAvatar(await readFile(row.cutout_path), Number(row.height_m));
  // a new file name, so no cache anywhere keeps showing the old picture
  const imagePath = `${userId}/avatars/${avatarId}-${Date.now().toString(36)}.png`;
  await upload(imagePath, png, 'image/png');
  must(await db.from('ssx_avatars').update({ image_path: imagePath }).eq('id', avatarId).eq('user_id', userId), 'save avatar');
  return { url: await signedUrl(imagePath) };
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
  if (!row) throw new ToolError('no such avatar', 404);
  let previous: string | null = null;
  if (row.job_id) {
    const job = must(await db.from('ssx_jobs').select('input').eq('id', row.job_id).maybeSingle(), 'job') as Pick<AvatarJob, 'input'> | null;
    previous = job?.input.previous_avatar_id ?? null;
  }
  must(
    await db.from('ssx_profiles').update({ active_avatar_id: previous }).eq('user_id', userId).eq('active_avatar_id', avatarId),
    'restore avatar',
  );
}
