import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { levelFor, lifetimeEarned } from '../../shared/level.js';
import { levelUpLine, MISSION_REASON, dayStart, type ReceiptLine } from '../../shared/receipt.js';
import { loadRules } from './rules.js';

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

// Rescore rows belong to the day of their dump, not the day the script ran, so they never use up today's cap.
export const RESCORE_REASON = 'rescore';

// Cubes earned since the start of the player's day, and how many dumps earned some.
export async function todayEarnings(userId: string, now: Date, tzOffsetMin: number) {
  const rows = must(
    await admin()
      .from('ssx_ledger')
      .select('delta, dump_id, reason')
      .eq('user_id', userId)
      .gt('delta', 0)
      .neq('reason', RESCORE_REASON)
      .gte('created_at', dayStart(now, tzOffsetMin).toISOString()),
    'ledger today',
  ) as { delta: number; dump_id: string | null; reason: string }[];
  return {
    earned: rows.reduce((a, r) => a + r.delta, 0),
    dumps: new Set(rows.filter((r) => r.reason !== MISSION_REASON).map((r) => r.dump_id).filter(Boolean)).size,
  };
}

// All positive ledger rows, paged because the API returns at most 1000 rows per request.
async function lifetimeTotal(userId: string): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await admin()
        .from('ssx_ledger')
        .select('delta')
        .eq('user_id', userId)
        .gt('delta', 0)
        .order('id')
        .range(from, from + 999),
      'ledger lifetime',
    ) as { delta: number }[];
    total += lifetimeEarned(rows);
    if (rows.length < 1000) return total;
  }
}

// Call after the ledger rows are written. Appends the level up line to the receipt when earned.
export async function levelFields(userId: string, justAwarded: number, receipt: ReceiptLine[]) {
  const thresholds = loadRules().levels.thresholds;
  const lifetime = await lifetimeTotal(userId);
  const now = levelFor(lifetime, thresholds);
  const leveledUp = now.level > levelFor(lifetime - justAwarded, thresholds).level;
  if (leveledUp) receipt.push(levelUpLine(now.level));
  return { level: now.level, level_progress: now.progress, leveled_up: leveledUp };
}
