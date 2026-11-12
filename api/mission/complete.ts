import type { VercelRequest, VercelResponse } from '@vercel/node';
import { missionDoneReceipt } from '../../shared/receipt.js';
import { admin, must, requireUser, todayEarnings, tzOffset, walletTotal } from '../_lib/http.js';
import { loadRules } from '../_lib/rules.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const missionId = body.mission_id;
    if (typeof missionId !== 'string' || !UUID.test(missionId)) {
      return res.status(400).json({ error: 'bad mission id' });
    }

    const db = admin();
    const rules = loadRules();

    // the status filter makes a second tap a no-op, so cubes are awarded once
    const closed = must(
      await db
        .from('ssx_missions')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', missionId)
        .eq('user_id', userId)
        .eq('status', 'open')
        .select('id, title'),
      'complete mission',
    ) as { id: string; title: string }[];
    if (!closed.length) return res.status(404).json({ error: 'no open mission with that id' });

    // mission rewards count toward the daily cap
    const today = await todayEarnings(userId, new Date(), tzOffset(body.tz_offset_min));
    const award = Math.min(rules.mission_completed, Math.max(0, rules.daily_cap - today.earned));
    if (award > 0) {
      must(
        await db.from('ssx_ledger').insert({
          user_id: userId,
          delta: award,
          reason: 'mission_completed',
          rules_version: rules.rules_version,
        }),
        'insert ledger',
      );
    }

    return res.status(200).json({
      receipt: missionDoneReceipt(closed[0].title, award, award < rules.mission_completed),
      cubes_awarded: award,
      wallet: await walletTotal(userId),
    });
  } catch (err) {
    console.error('[mission/complete] failed:', err instanceof Error ? err.message : 'unknown');
    return res.status(500).json({ error: 'something broke' });
  }
}
