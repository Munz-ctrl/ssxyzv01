import { admin, must } from './http.js';
import { getPrediction, outputUrl } from './replicate.js';

// Shared by every tool that runs a long AI job (avatar, surface, later items and the bake):
// storage helpers and the ssx_jobs row that the client's polls move forward one step at a time.

export const BUCKET = 'ssx';
const SIGNED_SECONDS = 60 * 60;
export const MAX_JOB_MINUTES = 15;

// A failure the player should read. Everything else is logged and shown as a generic line.
export class ToolError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface JobRow<I = Record<string, unknown>, S = Record<string, unknown>, O = Record<string, unknown>> {
  id: string;
  user_id: string;
  kind: string;
  status: 'working' | 'done' | 'failed';
  step: string;
  input: I;
  state: S;
  output: O | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error || !data) throw new Error(`sign ${path}: ${error?.message}`);
  return data.signedUrl;
}

export async function upload(path: string, bytes: Buffer, contentType: string) {
  const { error } = await admin().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

export async function readFile(path: string): Promise<Buffer> {
  const { data, error } = await admin().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// One-time upload slot for a client photo: the client never writes to storage on its own.
export async function uploadSlot(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`upload slot: ${error?.message}`);
  return { path, token: data.token };
}

// Updates a working job. With `whereStep` it only applies if the job is still on that step,
// which is how a poll claims a step: false means another poll got there first.
export async function updateJob(jobId: string, fields: Record<string, unknown>, whereStep?: string): Promise<boolean> {
  let q = admin()
    .from('ssx_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'working');
  if (whereStep) q = q.eq('step', whereStep);
  const rows = must(await q.select('id'), 'update job') as { id: string }[];
  return rows.length > 0;
}

export async function failJob(jobId: string, err: unknown, tag: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${tag}] job failed:`, message.slice(0, 300));
  await updateJob(jobId, { status: 'failed', error: message.slice(0, 500) }).catch(() => {});
}

export async function loadJob<J extends JobRow>(userId: string, jobId: string, kind: string): Promise<J> {
  const job = must(
    await admin().from('ssx_jobs').select('*').eq('id', jobId).eq('user_id', userId).eq('kind', kind).maybeSingle(),
    'load job',
  ) as J | null;
  if (!job) throw new ToolError('no such job', 404);
  return job;
}

// Creates the job row. The unique index allows one working job per player and kind.
export async function insertJob(userId: string, kind: string, step: string, input: Record<string, unknown>, busy: string): Promise<string> {
  const inserted = await admin().from('ssx_jobs').insert({ user_id: userId, kind, step, input }).select('id').single();
  if (inserted.error) {
    if (inserted.error.code === '23505') throw new ToolError(busy, 409);
    throw new Error(`insert job: ${inserted.error.message}`);
  }
  return (inserted.data as { id: string }).id;
}

export function jobAge(job: JobRow) {
  return {
    minutes: (Date.now() - new Date(job.created_at).getTime()) / 60000,
    idleSeconds: (Date.now() - new Date(job.updated_at).getTime()) / 1000,
  };
}

// The output url of a finished prediction, null while it still runs. Throws if it failed.
export async function finishedPrediction(id: string): Promise<string | null> {
  const p = await getPrediction(id);
  if (p.status === 'failed' || p.status === 'canceled') throw new Error(`prediction ${p.status}: ${String(p.error ?? '')}`);
  if (p.status !== 'succeeded') return null;
  const url = outputUrl(p.output);
  if (!url) throw new Error('prediction had no output');
  return url;
}

// Takes cubes for a finished job. Only ever called once the thing exists.
export async function charge(userId: string, cost: number, reason: string, rulesVersion: string) {
  if (cost <= 0) return;
  must(await admin().from('ssx_ledger').insert({ user_id: userId, delta: -cost, reason, rules_version: rulesVersion }), `charge ${reason}`);
}
