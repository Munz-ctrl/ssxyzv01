// Re-runs the sorter on one player's dumps that were saved with agent_version = 'fallback'.
// Server only: needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY in the environment.
//
//   npx tsx --env-file=.env.local scripts/rescore.ts --user <email or user id> --dry-run
//   npx tsx --env-file=.env.local scripts/rescore.ts --user <email or user id>

import { dayStart, MISSION_REASON } from '../shared/receipt.js';
import { applyParts, clean, hasRisk, partRows, type OpenMission } from '../api/_lib/apply.js';
import { admin, must, RESCORE_REASON } from '../api/_lib/http.js';
import { computeCubes, loadRules, similarity } from '../api/_lib/rules.js';
import { sortDump, sorterModel } from '../api/_lib/sorter.js';

interface Dump {
  id: string;
  raw_text: string | null;
  created_at: string;
  client_meta: { tz_offset_min?: number } | null;
}

interface LedgerRow {
  delta: number;
  dump_id: string | null;
  reason: string;
  created_at: string;
}

const DAY_MS = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Same roll every run, so a dry run and the real run agree on rare drops.
function stableRoll(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h / 4294967296;
}

async function pageAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await page(from, from + 999), what) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function resolveUser(arg: string): Promise<string> {
  if (UUID.test(arg)) return arg;
  for (let page = 1; ; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`could not list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === arg.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) fail(`no user with email ${arg}`);
  }
}

export async function rescore(userId: string, dryRun: boolean, log: (line: string) => void = console.log) {
  const db = admin();
  const rules = loadRules();

  const dumps = await pageAll<Dump>(
    (a, b) => db.from('ssx_dumps').select('id, raw_text, created_at, client_meta').eq('user_id', userId).order('created_at').range(a, b),
    'dumps',
  );
  const fallbackParts = await pageAll<{ dump_id: string }>(
    (a, b) => db.from('ssx_dump_parts').select('dump_id').eq('user_id', userId).eq('agent_version', 'fallback').order('id').range(a, b),
    'fallback parts',
  );
  const ledger = await pageAll<LedgerRow>(
    (a, b) => db.from('ssx_ledger').select('delta, dump_id, reason, created_at').eq('user_id', userId).order('id').range(a, b),
    'ledger',
  );
  const openRows = must(
    await db.from('ssx_missions').select('id, title, next_steps').eq('user_id', userId).eq('status', 'open'),
    'open missions',
  ) as OpenMission[];

  const open = new Map(openRows.map((m) => [m.id, m]));
  const byId = new Map(dumps.map((d) => [d.id, d]));
  const targets = new Set(fallbackParts.map((p) => p.dump_id));
  const todo = dumps.filter((d) => targets.has(d.id) && d.raw_text);

  // A ledger row belongs to the day of its dump; rows without a dump belong to the day they were written.
  const when = (r: LedgerRow) => new Date((r.dump_id && byId.get(r.dump_id)?.created_at) || r.created_at).getTime();

  log(`${dryRun ? 'dry run' : 'rescore'}: ${todo.length} fallback dumps, rules ${rules.rules_version}, model ${sorterModel()}\n`);

  let added = 0;
  let failed = 0;
  for (const dump of todo) {
    const text = dump.raw_text!;
    const at = new Date(dump.created_at);
    const index = dumps.indexOf(dump);
    const recent = dumps.slice(Math.max(0, index - (rules.agent?.context_dumps ?? 20)), index).reverse();
    const label = `${dump.created_at.slice(0, 16)}  "${clean(text, 60).replace(/\s+/g, ' ')}"`;

    let parts;
    try {
      parts = await sortDump(text, {
        recent: recent.map((d) => ({ text: clean(d.raw_text, 600), at: d.created_at })),
        openMissions: [...open.values()],
      });
    } catch (err) {
      failed += 1;
      log(`${label}\n  sorter failed, left as is: ${err instanceof Error ? err.message : 'unknown'}\n`);
      continue;
    }

    if (!dryRun) {
      must(await db.from('ssx_dump_parts').delete().eq('dump_id', dump.id).eq('user_id', userId), 'delete old parts');
      must(await db.from('ssx_dump_parts').insert(partRows(parts, dump.id, userId, sorterModel())), 'insert parts');
    }
    if (hasRisk(parts)) {
      log(`${label}\n  flagged as risk: parts replaced, no rewards\n`);
      continue;
    }

    const start = dayStart(at, dump.client_meta?.tz_offset_min ?? 0).getTime();
    const sameDay = ledger.filter((r) => r.delta > 0 && when(r) >= start && when(r) < start + DAY_MS);
    const already = ledger.filter((r) => r.delta > 0 && r.dump_id === dump.id).reduce((a, r) => a + r.delta, 0);
    const dayOther = sameDay.reduce((a, r) => a + r.delta, 0) - already;
    const earnersBefore = new Set(
      sameDay
        .filter((r) => r.reason !== MISSION_REASON && r.dump_id && r.dump_id !== dump.id && when(r) < at.getTime())
        .map((r) => r.dump_id),
    ).size;

    const applied = await applyParts({
      db,
      userId,
      dumpId: dump.id,
      parts,
      open,
      capLeft: rules.daily_cap - dayOther,
      now: new Date(),
      rules,
      dryRun,
    });
    const cubes = computeCubes(
      {
        signals: parts.filter((p) => p.label === 'dump' && p.signals).map((p) => p.signals!),
        planned: applied.planned,
        closeRepeat: recent.some((d) => d.raw_text && similarity(d.raw_text, text) >= rules.repeat_similarity_threshold),
        firstOfDay: earnersBefore === 0,
        earningDumpsToday: earnersBefore,
        earnedToday: dayOther + applied.missionAward,
        rareRoll: stableRoll(dump.id),
      },
      rules,
    );
    const total = cubes.total + applied.missionAward;
    const diff = Math.max(0, total - already);

    if (diff > 0) {
      if (!dryRun) {
        must(
          await db.from('ssx_ledger').insert({
            user_id: userId,
            delta: diff,
            reason: RESCORE_REASON,
            dump_id: dump.id,
            rules_version: rules.rules_version,
          }),
          'insert rescore row',
        );
      }
      ledger.push({ delta: diff, dump_id: dump.id, reason: RESCORE_REASON, created_at: new Date().toISOString() });
      added += diff;
    }

    const r = applied.receipt;
    const extras = [
      ...r.missionsCreated!.map((m) => `+1 mission: ${m.title}`),
      ...r.missionsUpdated!.map((m) => `mission updated: ${m.title}`),
      ...r.missionsDone!.map((m) => `mission done: ${m.title}`),
      r.insights ? `+${r.insights} insight` : '',
      r.notes!.length ? `+${r.notes!.length} note` : '',
      r.wishlist ? `+${r.wishlist} wishlist` : '',
    ].filter(Boolean);
    log(`${label}\n  labels: ${parts.map((p) => p.label).join(', ')}`);
    log(`  cubes: had ${already}, now ${total}, rescore +${diff}${cubes.capReached ? ' (day cap reached)' : ''}`);
    if (extras.length) log(`  ${extras.join('\n  ')}`);
    log('');
  }

  log(`${dryRun ? 'would add' : 'added'} ${added} cubes across ${todo.length - failed} dumps${failed ? `, ${failed} failed` : ''}.`);
  if (dryRun) log('nothing was written.');
  return { added, failed, dumps: todo.length };
}

async function main() {
  const args = process.argv.slice(2);
  const userArg = args[args.indexOf('--user') + 1];
  if (!args.includes('--user') || !userArg) fail('usage: rescore.ts --user <email or user id> [--dry-run]');
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']) {
    if (!process.env[key]) fail(`${key} is not set`);
  }
  await rescore(await resolveUser(userArg), args.includes('--dry-run'));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/rescore.ts')) {
  main().catch((err) => fail(err instanceof Error ? err.message : 'rescore failed'));
}
