import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReceiptInput } from '../../shared/receipt.js';
import { must } from './http.js';
import type { CubeRules } from './rules.js';
import type { SortedPart } from './sorter.js';

export const MAX_CHARS = 20000;
export const clean = (s: string | null | undefined, max = 2000) => (s ?? '').trim().slice(0, max);

export interface OpenMission {
  id: string;
  title: string;
  next_steps: unknown;
}

export function fallbackPart(text: string): SortedPart {
  return {
    label: 'dump',
    content: text,
    ambiguous: false,
    signals: { real: true, new: 0, specific: 0, reflective: 0, plan: false, heavy: false, risk: false },
    mission: null,
    mission_done_id: null,
    insight: null,
    box_object: null,
    note: null,
    pattern: null,
    command_detail: null,
  };
}

export const hasRisk = (parts: SortedPart[]) => parts.some((p) => p.label === 'dump' && p.signals?.risk);

export function partRows(parts: SortedPart[], dumpId: string, userId: string, agentVersion: string) {
  return parts.map((p, i) => ({
    dump_id: dumpId,
    user_id: userId,
    part_index: i,
    label: p.label,
    content: clean(p.content, MAX_CHARS),
    signals:
      p.label === 'dump'
        ? { ...(p.signals ?? {}), box_object: p.box_object, ambiguous: p.ambiguous }
        : { command_detail: p.command_detail, ambiguous: p.ambiguous },
    heavy: p.label === 'dump' && !!p.signals?.heavy,
    agent_version: agentVersion,
  }));
}

interface ApplyOptions {
  db: SupabaseClient;
  userId: string;
  dumpId: string;
  parts: SortedPart[];
  open: Map<string, OpenMission>; // kept current: new missions are added, finished ones removed
  capLeft: number; // what is left of the day's cap for mission rewards
  now: Date;
  rules: CubeRules;
  dryRun?: boolean;
}

export interface ApplyResult {
  receipt: ReceiptInput;
  planned: boolean;
  missionAward: number;
  missionCapped: boolean;
}

let dryIds = 0;

// Writes missions, mission updates, vault items and wishlist rows for sorted parts. Cubes are the caller's job.
export async function applyParts(o: ApplyOptions): Promise<ApplyResult> {
  const { db, userId, dumpId, parts, open, rules } = o;
  const write = !o.dryRun;
  const receipt: ReceiptInput = {
    parts: parts.map((p) => ({ label: p.label, content: p.content, command_detail: p.command_detail })),
    cubes: 0,
    missionsCreated: [],
    missionsUpdated: [],
    missionsDone: [],
    insights: 0,
    patterns: 0,
    notes: [],
    wishlist: 0,
  };
  const vault: { kind: string; body: string }[] = [];
  let planned = false;
  let missionAward = 0;
  let missionCapped = false;

  for (const p of parts) {
    if (p.label === 'wishlist') {
      const request = clean(p.command_detail) || clean(p.content);
      if (!request) continue;
      if (write) {
        must(await db.from('ssx_wishlist').insert({ user_id: userId, request, source_dump_id: dumpId }), 'wishlist');
      }
      receipt.wishlist! += 1;
      continue;
    }
    if (p.label !== 'dump' || !p.signals?.real) continue;

    const title = clean(p.mission?.title, 200);
    if (p.signals.plan && p.mission && title) {
      const steps = p.mission.next_steps.map((s) => clean(s, 300)).filter(Boolean).slice(0, 3);
      const target = p.mission.updates_mission_id ? open.get(p.mission.updates_mission_id) : undefined;
      if (target) {
        if (write) {
          must(
            await db.from('ssx_missions').update({ title, next_steps: steps }).eq('id', target.id).eq('user_id', userId),
            'update mission',
          );
        }
        open.set(target.id, { id: target.id, title, next_steps: steps });
        receipt.missionsUpdated!.push({ title });
      } else {
        let id = `dry-run-${++dryIds}`;
        if (write) {
          const row = must(
            await db
              .from('ssx_missions')
              .insert({ user_id: userId, title, next_steps: steps, source_dump_id: dumpId })
              .select('id')
              .single(),
            'insert mission',
          ) as { id: string };
          id = row.id;
        }
        open.set(id, { id, title, next_steps: steps });
        receipt.missionsCreated!.push({ title, steps: steps.length });
      }
      planned = true;
    }

    const doneTarget = p.mission_done_id ? open.get(p.mission_done_id) : undefined;
    if (doneTarget) {
      let closed = true;
      if (write) {
        const rows = must(
          await db
            .from('ssx_missions')
            .update({ status: 'done', completed_at: o.now.toISOString() })
            .eq('id', doneTarget.id)
            .eq('user_id', userId)
            .eq('status', 'open')
            .select('id'),
          'complete mission',
        ) as { id: string }[];
        closed = rows.length > 0;
      }
      if (closed) {
        open.delete(doneTarget.id);
        const award = Math.min(rules.mission_completed, Math.max(0, o.capLeft - missionAward));
        missionAward += award;
        missionCapped ||= award < rules.mission_completed;
        receipt.missionsDone!.push({ title: doneTarget.title, cubes: award });
      }
    }

    if (clean(p.insight)) {
      vault.push({ kind: 'insight', body: clean(p.insight) });
      receipt.insights! += 1;
    }
    if (p.signals.heavy && clean(p.note)) {
      vault.push({ kind: 'note', body: clean(p.note) });
      receipt.notes!.push(clean(p.note));
    }
    if (clean(p.pattern)) {
      vault.push({ kind: 'pattern', body: clean(p.pattern) });
      receipt.patterns! += 1;
    }
  }

  if (write && vault.length) {
    must(
      await db.from('ssx_vault_items').insert(vault.map((v) => ({ ...v, user_id: userId, source_dump_ids: [dumpId] }))),
      'insert vault items',
    );
  }

  return { receipt, planned, missionAward, missionCapped };
}
