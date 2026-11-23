import type { ModelRef } from './tools/avatarConfig.js';

// Minimal Replicate client: start a prediction, read it back. Never waits; callers poll.

const API = 'https://api.replicate.com/v1';

export interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: unknown;
}

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) throw new Error('replicate token missing');
  return t;
}

async function call(path: string, init: RequestInit = {}, tries = 3): Promise<Prediction> {
  for (let i = 0; ; i++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (res.ok) return (await res.json()) as Prediction;
    // only retry the transient ones
    if (![429, 502, 503, 504].includes(res.status) || i >= tries - 1) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`replicate ${res.status}: ${text}`);
    }
    await new Promise((r) => setTimeout(r, 700 * (i + 1)));
  }
}

// Official models take the model path; community models need a version id.
export function startPrediction(ref: ModelRef, input: Record<string, unknown>): Promise<Prediction> {
  const body = { input: { ...ref.input, ...input } };
  return ref.version
    ? call('/predictions', { method: 'POST', body: JSON.stringify({ ...body, version: ref.version }) })
    : call(`/models/${ref.model}/predictions`, { method: 'POST', body: JSON.stringify(body) });
}

export const getPrediction = (id: string) => call(`/predictions/${encodeURIComponent(id)}`);

// Models return a url, a list of urls, or an object holding one.
export function outputUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return outputUrl(output[0]);
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    return outputUrl(o.image ?? o.output ?? o.url ?? null);
  }
  return null;
}

export async function download(url: string): Promise<{ bytes: Buffer; type: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') ?? 'image/png' };
}
