import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MISSION_REASON, dayStart } from '../../shared/receipt.js';

let db: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase env vars missing');
  db ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return db;
}

// Verifies the Supabase JWT. Sends the error response itself and returns null on failure.
export async function requireUser(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return null;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'not signed in' });
    return null;
  }
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'not signed in' });
    return null;
  }
  return data.user.id;
}

export function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export async function walletTotal(userId: string): Promise<number> {
  const row = must(
    await admin().from('ssx_wallet').select('cubes').eq('user_id', userId).maybeSingle(),
    'wallet',
  ) as { cubes: number } | null;
  return row?.cubes ?? 0;
}

export function tzOffset(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-840, Math.min(840, Math.round(n))) : 0;
}

// Cubes earned since the start of the player's day, and how many dumps earned some.
export async function todayEarnings(userId: string, now: Date, tzOffsetMin: number) {
  const rows = must(
    await admin()
      .from('ssx_ledger')
      .select('delta, dump_id, reason')
      .eq('user_id', userId)
      .gt('delta', 0)
      .gte('created_at', dayStart(now, tzOffsetMin).toISOString()),
    'ledger today',
  ) as { delta: number; dump_id: string | null; reason: string }[];
  return {
    earned: rows.reduce((a, r) => a + r.delta, 0),
    dumps: new Set(rows.filter((r) => r.reason !== MISSION_REASON).map((r) => r.dump_id).filter(Boolean)).size,
  };
}
