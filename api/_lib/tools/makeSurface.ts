import { checkTarget, RoomError, setTexture, type Room, type SurfaceTarget } from '../../../shared/room.js';
import { walletTotal } from '../http.js';
import {
  charge,
  failJob,
  finishedPrediction,
  insertJob,
  jobAge,
  loadJob,
  MAX_JOB_MINUTES,
  ToolError,
  updateJob,
  upload,
  type JobRow,
} from '../jobs.js';
import { download, startPrediction } from '../replicate.js';
import { loadRules } from '../rules.js';
import { loadRoom, saveRoom } from './editWalls.js';
import { presetIds, surfaceConfig } from './roomConfig.js';
import { toTexture } from './surfaceImage.js';

// Tool: put a texture on the floor, one wall segment, or all walls.
//   preset         -> free, applied at once, returns the room
//   photo / prompt -> costs `costs.surface`, starts a job (nano banana), returns its id
// The job is advanced by advanceSurfaceJob on each client poll, like the avatar job.

const KIND = 'surface';

type SurfaceJob = JobRow<
  { target: SurfaceTarget; cost: number; prompt?: string; photo_path?: string },
  { generate_id?: string },
  { texture?: string }
>;

export interface SurfaceJobView {
  id: string;
  status: SurfaceJob['status'];
  step: string;
  error?: string;
  room?: Room;
}

function target(room: Room, value: unknown): SurfaceTarget {
  try {
    return checkTarget(value, room);
  } catch (err) {
    if (err instanceof RoomError) throw new ToolError(err.message);
    throw err;
  }
}

export const surfacePrice = () => loadRules().costs.surface ?? 0;

export async function makeSurface(args: {
  userId: string;
  target: unknown;
  preset?: string;
  photoUrl?: string;
  photoPath?: string;
  prompt?: string;
}): Promise<{ room: Room } | { jobId: string; cost: number }> {
  const { userId } = args;
  const cfg = surfaceConfig();
  const room = await loadRoom(userId);
  const where = target(room, args.target);

  if (args.preset !== undefined) {
    if (args.preset !== 'plain' && !presetIds().includes(args.preset)) throw new ToolError('no such surface');
    const next = setTexture(room, where, args.preset === 'plain' ? null : `preset:${args.preset}`);
    await saveRoom(userId, next);
    return { room: next };
  }

  const prompt = typeof args.prompt === 'string' ? args.prompt.replace(/\s+/g, ' ').trim() : '';
  if (!args.photoUrl && !prompt) throw new ToolError('add a photo or describe it');
  if (prompt.length > cfg.prompt_max_chars) throw new ToolError(`keep it under ${cfg.prompt_max_chars} characters`);

  const cost = surfacePrice();
  if (cost > 0 && (await walletTotal(userId)) < cost) throw new ToolError(`not enough cubes. this costs ${cost} 🧊`, 402);

  const jobId = await insertJob(
    userId,
    KIND,
    'generating',
    { target: where, cost, ...(prompt ? { prompt } : {}), ...(args.photoPath ? { photo_path: args.photoPath } : {}) },
    'already making a texture. hang on.',
  );
  try {
    const g = cfg.generate;
    const subject = args.photoUrl ? g.subject_photo : prompt;
    const input: Record<string, unknown> = { prompt: g.prompt.replace('{subject}', subject) };
    if (args.photoUrl) input.image_input = [args.photoUrl];
    const prediction = await startPrediction(g, input);
    await updateJob(jobId, { state: { generate_id: prediction.id } });
  } catch (err) {
    await failJob(jobId, err, KIND);
    throw err;
  }
  return { jobId, cost };
}

export async function advanceSurfaceJob(userId: string, jobId: string): Promise<SurfaceJobView> {
  let job = await loadJob<SurfaceJob>(userId, jobId, KIND);
  if (job.status === 'working') {
    try {
      const { minutes, idleSeconds } = jobAge(job);
      if (minutes > MAX_JOB_MINUTES) throw new Error('job timed out');
      if (job.step === 'processing' && idleSeconds > surfaceConfig().stale_seconds) throw new Error('stuck in processing');
      if (job.step === 'generating' && job.state.generate_id) await afterGenerate(job);
    } catch (err) {
      await failJob(job.id, err, KIND);
    }
    job = await loadJob<SurfaceJob>(userId, jobId, KIND);
  }
  const v: SurfaceJobView = { id: job.id, status: job.status, step: job.step };
  if (job.status === 'failed') v.error = 'that did not work. no cubes spent. try again.';
  if (job.status === 'done') v.room = await loadRoom(userId);
  return v;
}

async function afterGenerate(job: SurfaceJob) {
  const url = await finishedPrediction(job.state.generate_id!);
  if (!url || !(await updateJob(job.id, { step: 'processing' }, 'generating'))) return;

  const cfg = surfaceConfig();
  const picture = await download(url);
  const texture = await toTexture(picture.bytes, {
    size: cfg.size_px,
    band: cfg.blend_edges,
    saturation: cfg.tone.saturation,
    contrast: cfg.tone.contrast,
  });
  const path = `${job.user_id}/surfaces/${job.id}.jpg`;
  await upload(path, texture, 'image/jpeg');

  // the room may have changed while this ran: apply to what is there now
  const room = await loadRoom(job.user_id);
  let next = room;
  try {
    next = setTexture(room, job.input.target, path);
  } catch {
    // that wall was removed meanwhile: keep the file, leave the room as it is
  }
  if (next !== room) await saveRoom(job.user_id, next);

  // charged only once the texture exists
  await charge(job.user_id, job.input.cost, 'surface', loadRules().rules_version);
  await updateJob(job.id, { status: 'done', step: 'done', output: { texture: path } });
}
