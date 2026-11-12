import type { User } from '@supabase/supabase-js';
import { lifetimeEarned } from '../../shared/level';
import { buildReceipt, MISSION_REASON, type Label, type ReceiptLine } from '../../shared/receipt';
import { supabase } from './supabase';

export interface Mission {
  id: string;
  title: string;
  next_steps: string[];
  source_dump_id: string | null;
}

export interface VaultItem {
  id: string;
  kind: string;
  body: string;
  source_dump_ids: string[];
  created_at: string;
}

export interface Wish {
  id: string;
  request: string;
  source_dump_id: string | null;
}

export interface HistoryEntry {
  id: string;
  text: string;
  created_at: string;
  receipt: ReceiptLine[];
}

export interface Game {
  handle: string;
  dumpCount: number;
  wallet: number;
  lifetime: number;
  missions: Mission[];
  vault: VaultItem[];
  wishlist: Wish[];
  history: HistoryEntry[];
}

interface ApiResult {
  receipt: ReceiptLine[];
  cubes_awarded: number;
  wallet: number;
}

const tzOffsetMin = () => -new Date().getTimezoneOffset();

// All positive ledger rows, paged because the API returns at most 1000 rows per request.
async function lifetimeTotal(uid: string): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const rows =
      ok(
        await supabase
          .from('ssx_ledger')
          .select('delta')
          .eq('user_id', uid)
          .gt('delta', 0)
          .order('id')
          .range(from, from + 999),
      ) ?? [];
    total += lifetimeEarned(rows);
    if (rows.length < 1000) return total;
  }
}

function ok<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function ensureProfile(user: User): Promise<string> {
  const row = ok(await supabase.from('ssx_profiles').select('display_name').eq('user_id', user.id).maybeSingle());
  if (row?.display_name) return row.display_name;
  const handle = (user.email ?? 'player').split('@')[0].toLowerCase();
  ok(await supabase.from('ssx_profiles').upsert({ user_id: user.id, display_name: handle }));
  return handle;
}

export async function loadGame(user: User): Promise<Game> {
  const uid = user.id;
  const [handle, count, wallet, lifetime, missions, vault, wishlist, dumps] = await Promise.all([
    ensureProfile(user),
    supabase.from('ssx_dumps').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('ssx_wallet').select('cubes').eq('user_id', uid).maybeSingle(),
    lifetimeTotal(uid),
    supabase
      .from('ssx_missions')
      .select('id, title, next_steps, source_dump_id, status')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('ssx_vault_items')
      .select('id, kind, body, source_dump_ids, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('ssx_wishlist')
      .select('id, request, source_dump_id')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('ssx_dumps')
      .select('id, raw_text, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const dumpRows = ok(dumps) ?? [];
  const ids = dumpRows.map((d) => d.id);
  const [parts, ledger] = ids.length
    ? await Promise.all([
        supabase.from('ssx_dump_parts').select('dump_id, part_index, label, content, signals').in('dump_id', ids),
        supabase.from('ssx_ledger').select('dump_id, delta, reason').in('dump_id', ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const allMissions = (ok(missions) ?? []) as (Mission & { status: string })[];
  const vaultRows = (ok(vault) ?? []) as VaultItem[];
  const wishRows = (ok(wishlist) ?? []) as Wish[];
  const partRows = (ok(parts) ?? []) as {
    dump_id: string;
    part_index: number;
    label: Label;
    content: string | null;
    signals: { risk?: boolean; command_detail?: string | null } | null;
  }[];
  const ledgerRows = (ok(ledger) ?? []) as { dump_id: string; delta: number; reason: string }[];

  const history = dumpRows.map((d): HistoryEntry => {
    const mine = partRows.filter((p) => p.dump_id === d.id).sort((a, b) => a.part_index - b.part_index);
    const rows = ledgerRows.filter((l) => l.dump_id === d.id);
    const fromVault = vaultRows.filter((v) => v.source_dump_ids.includes(d.id));
    return {
      id: d.id,
      text: d.raw_text ?? '',
      created_at: d.created_at,
      receipt: buildReceipt({
        risk: mine.some((p) => p.signals?.risk),
        parts: mine.map((p) => ({ label: p.label, content: p.content, command_detail: p.signals?.command_detail })),
        cubes: rows.filter((l) => l.reason !== MISSION_REASON).reduce((a, l) => a + l.delta, 0),
        missionsCreated: allMissions
          .filter((m) => m.source_dump_id === d.id)
          .map((m) => ({ title: m.title, steps: m.next_steps.length })),
        missionsDone: rows
          .filter((l) => l.reason === MISSION_REASON)
          .map((l) => ({ title: 'from this dump', cubes: l.delta })),
        insights: fromVault.filter((v) => v.kind === 'insight').length,
        patterns: fromVault.filter((v) => v.kind === 'pattern').length,
        notes: fromVault.filter((v) => v.kind === 'note').map((v) => v.body),
        wishlist: wishRows.filter((w) => w.source_dump_id === d.id).length,
      }),
    };
  });

  return {
    handle,
    dumpCount: count.count ?? 0,
    wallet: ok(wallet)?.cubes ?? 0,
    lifetime,
    missions: allMissions.filter((m) => m.status === 'open'),
    vault: vaultRows,
    wishlist: wishRows,
    history,
  };
}

async function post(path: string, body: Record<string, unknown>): Promise<ApiResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not signed in');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error ?? 'something broke. try again.');
  return json as ApiResult;
}

export const sendDump = (text: string, inputType: 'text' | 'voice') =>
  post('/api/dump', { text, input_type: inputType, tz_offset_min: tzOffsetMin() });

export const completeMission = (missionId: string) => post('/api/mission/complete', { mission_id: missionId, tz_offset_min: tzOffsetMin() });

// Stable pseudo coordinates until the map exists.
export function coordsFor(userId: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 16777619) >>> 0;
  return [(h % 199) - 99, ((h >>> 12) % 199) - 99];
}
