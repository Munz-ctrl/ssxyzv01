import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildReceipt, type ReceiptInput } from '../shared/receipt.js';
import { admin, must, requireUser, todayEarnings, tzOffset, walletTotal } from './_lib/http.js';
import { computeCubes, loadRules, preCheck, similarity, type RecentDump } from './_lib/rules.js';
import { sortDump, sorterModel, type SortedPart } from './_lib/sorter.js';

const MAX_CHARS = 20000;
const clean = (s: string | null | undefined, max = 2000) => (s ?? '').trim().slice(0, max);

function fallbackPart(text: string): SortedPart {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const inputType = body.input_type === 'voice' ? 'voice' : 'text';
    if (!text) return res.status(400).json({ error: 'empty dump' });
    if (text.length > MAX_CHARS) return res.status(413).json({ error: 'dump too long' });

    const db = admin();
    const rules = loadRules();
    const now = new Date();
    const tz = tzOffset(body.tz_offset_min);

    const recent = must(
      await db
        .from('ssx_dumps')
        .select('raw_text, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(rules.agent?.context_dumps ?? 20),
      'recent dumps',
    ) as RecentDump[];

    const dump = must(
      await db
        .from('ssx_dumps')
        .insert({ user_id: userId, raw_text: text, input_type: inputType, client_meta: { tz_offset_min: tz } })
        .select('id')
        .single(),
      'insert dump',
    ) as { id: string };

    const spam = preCheck(text, recent, now, rules);
    if (spam) {
      must(
        await db.from('ssx_dump_parts').insert({
          dump_id: dump.id,
          user_id: userId,
          label: 'spam',
          content: text,
          signals: { precheck: spam },
          agent_version: 'precheck',
        }),
        'insert spam part',
      );
      return res.status(200).json({
        dump_id: dump.id,
        receipt: buildReceipt({ parts: [{ label: 'spam', content: text }], cubes: 0 }),
        cubes_awarded: 0,
        wallet: await walletTotal(userId),
      });
    }

    const openMissions = must(
      await db
        .from('ssx_missions')
        .select('id, title, next_steps')
        .eq('user_id', userId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50),
      'open missions',
    ) as { id: string; title: string; next_steps: unknown }[];

    let parts: SortedPart[];
    let agentVersion = sorterModel();
    let sorted = true;
    try {
      parts = await sortDump(text, {
        recent: recent.map((d) => ({ text: clean(d.raw_text, 600), at: d.created_at })),
        openMissions,
      });
    } catch (err) {
      console.error('[dump] sorter failed, base reward only:', err instanceof Error ? err.message : 'unknown');
      parts = [fallbackPart(text)];
      agentVersion = 'fallback';
      sorted = false;
    }

    const risk = parts.some((p) => p.label === 'dump' && p.signals?.risk);

    must(
      await db.from('ssx_dump_parts').insert(
        parts.map((p, i) => ({
          dump_id: dump.id,
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
        })),
      ),
      'insert parts',
    );

    if (risk) {
      return res.status(200).json({
        dump_id: dump.id,
        receipt: buildReceipt({ risk: true, parts: [], cubes: 0 }),
        cubes_awarded: 0,
        wallet: await walletTotal(userId),
      });
    }

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
    const ledger: { reason: string; delta: number }[] = [];
    const open = new Map(openMissions.map((m) => [m.id, m]));
    const vault: { kind: string; body: string }[] = [];
    let planned = false;

    for (const p of parts) {
      if (p.label === 'wishlist') {
        const request = clean(p.command_detail) || clean(p.content);
        if (!request) continue;
        must(await db.from('ssx_wishlist').insert({ user_id: userId, request, source_dump_id: dump.id }), 'wishlist');
        receipt.wishlist! += 1;
        continue;
      }
      if (p.label !== 'dump' || !p.signals?.real) continue;

      const title = clean(p.mission?.title, 200);
      if (p.signals.plan && p.mission && title) {
        const steps = p.mission.next_steps.map((s) => clean(s, 300)).filter(Boolean).slice(0, 3);
        const target = p.mission.updates_mission_id ? open.get(p.mission.updates_mission_id) : undefined;
        if (target) {
          must(
            await db.from('ssx_missions').update({ title, next_steps: steps }).eq('id', target.id).eq('user_id', userId),
            'update mission',
          );
          receipt.missionsUpdated!.push({ title });
        } else {
          must(
            await db
              .from('ssx_missions')
              .insert({ user_id: userId, title, next_steps: steps, source_dump_id: dump.id }),
            'insert mission',
          );
          receipt.missionsCreated!.push({ title, steps: steps.length });
        }
        planned = true;
      }

      const doneTarget = p.mission_done_id ? open.get(p.mission_done_id) : undefined;
      if (doneTarget) {
        const closed = must(
          await db
            .from('ssx_missions')
            .update({ status: 'done', completed_at: now.toISOString() })
            .eq('id', doneTarget.id)
            .eq('user_id', userId)
            .eq('status', 'open')
            .select('id'),
          'complete mission',
        ) as { id: string }[];
        if (closed.length) {
          open.delete(doneTarget.id);
          ledger.push({ reason: 'mission_completed', delta: rules.mission_completed });
          receipt.missionsDone!.push({ title: doneTarget.title, cubes: rules.mission_completed });
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

    if (vault.length) {
      must(
        await db
          .from('ssx_vault_items')
          .insert(vault.map((v) => ({ ...v, user_id: userId, source_dump_ids: [dump.id] }))),
        'insert vault items',
      );
    }

    const today = await todayEarnings(userId, now, tz);
    const closeRepeat = recent.some(
      (d) => d.raw_text && similarity(d.raw_text, text) >= rules.repeat_similarity_threshold,
    );
    const cubes = computeCubes(
      {
        signals: parts.filter((p) => p.label === 'dump' && p.signals).map((p) => p.signals!),
        planned,
        closeRepeat: closeRepeat || !sorted,
        firstOfDay: today.dumps === 0,
        earningDumpsToday: today.dumps,
        earnedToday: today.earned,
        rareRoll: Math.random(),
      },
      rules,
    );
    ledger.push(...cubes.rows);
    receipt.cubes = cubes.total;
    receipt.capReached = cubes.capReached;

    if (ledger.length) {
      must(
        await db.from('ssx_ledger').insert(
          ledger.map((r) => ({ ...r, user_id: userId, dump_id: dump.id, rules_version: rules.rules_version })),
        ),
        'insert ledger',
      );
    }

    // commands earn nothing and cost nothing yet: their part rows are the saved record

    return res.status(200).json({
      dump_id: dump.id,
      receipt: buildReceipt(receipt),
      cubes_awarded: ledger.reduce((a, r) => a + r.delta, 0),
      wallet: await walletTotal(userId),
    });
  } catch (err) {
    console.error('[dump] failed:', err instanceof Error ? err.message : 'unknown');
    return res.status(500).json({ error: 'something broke. your dump was not lost if it was saved.' });
  }
}
