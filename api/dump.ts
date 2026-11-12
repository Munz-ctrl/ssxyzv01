import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildReceipt } from '../shared/receipt.js';
import { applyParts, clean, fallbackPart, hasRisk, MAX_CHARS, partRows } from './_lib/apply.js';
import { admin, levelFields, must, requireUser, todayEarnings, tzOffset, walletTotal } from './_lib/http.js';
import { computeCubes, loadRules, preCheck, similarity, type RecentDump } from './_lib/rules.js';
import { sortDump, sorterModel, type SortedPart } from './_lib/sorter.js';

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
      const lines = buildReceipt({ parts: [{ label: 'spam', content: text }], cubes: 0 });
      return res.status(200).json({
        dump_id: dump.id,
        receipt: lines,
        cubes_awarded: 0,
        wallet: await walletTotal(userId),
        ...(await levelFields(userId, 0, lines)),
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

    const risk = hasRisk(parts);

    must(await db.from('ssx_dump_parts').insert(partRows(parts, dump.id, userId, agentVersion)), 'insert parts');

    if (risk) {
      const lines = buildReceipt({ risk: true, parts: [], cubes: 0 });
      return res.status(200).json({
        dump_id: dump.id,
        receipt: lines,
        cubes_awarded: 0,
        wallet: await walletTotal(userId),
        ...(await levelFields(userId, 0, lines)),
      });
    }

    const today = await todayEarnings(userId, now, tz);
    const applied = await applyParts({
      db,
      userId,
      dumpId: dump.id,
      parts,
      open: new Map(openMissions.map((m) => [m.id, m])),
      capLeft: rules.daily_cap - today.earned,
      now,
      rules,
    });
    const { receipt } = applied;
    const ledger: { reason: string; delta: number }[] = [];
    if (applied.missionAward > 0) ledger.push({ reason: 'mission_completed', delta: applied.missionAward });

    const closeRepeat = recent.some(
      (d) => d.raw_text && similarity(d.raw_text, text) >= rules.repeat_similarity_threshold,
    );
    const cubes = computeCubes(
      {
        signals: parts.filter((p) => p.label === 'dump' && p.signals).map((p) => p.signals!),
        planned: applied.planned,
        closeRepeat: closeRepeat || !sorted,
        firstOfDay: today.dumps === 0,
        earningDumpsToday: today.dumps,
        earnedToday: today.earned + applied.missionAward,
        rareRoll: Math.random(),
      },
      rules,
    );
    ledger.push(...cubes.rows);
    receipt.cubes = cubes.total;
    receipt.capReached = cubes.capReached || applied.missionCapped;

    if (ledger.length) {
      must(
        await db.from('ssx_ledger').insert(
          ledger.map((r) => ({ ...r, user_id: userId, dump_id: dump.id, rules_version: rules.rules_version })),
        ),
        'insert ledger',
      );
    }

    // commands earn nothing and cost nothing yet: their part rows are the saved record

    const lines = buildReceipt(receipt);
    const awarded = ledger.reduce((a, r) => a + r.delta, 0);
    return res.status(200).json({
      dump_id: dump.id,
      receipt: lines,
      cubes_awarded: awarded,
      wallet: await walletTotal(userId),
      ...(await levelFields(userId, awarded, lines)),
    });
  } catch (err) {
    console.error('[dump] failed:', err instanceof Error ? err.message : 'unknown');
    return res.status(500).json({ error: 'something broke. your dump was not lost if it was saved.' });
  }
}
