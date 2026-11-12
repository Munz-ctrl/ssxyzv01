import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let ids = 0;

// Just enough of the supabase query builder for the rescore script.
function from(table: string) {
  const rows = (tables[table] ??= []);
  const filters: [string, unknown][] = [];
  let action: 'select' | 'insert' | 'delete' | 'update' = 'select';
  let payload: Row | Row[] | null = null;
  let single = false;
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
  const q = {
    select: () => q,
    order: () => q,
    range: () => q,
    eq: (k: string, v: unknown) => (filters.push([k, v]), q),
    insert: (p: Row | Row[]) => ((action = 'insert'), (payload = p), q),
    update: (p: Row) => ((action = 'update'), (payload = p), q),
    delete: () => ((action = 'delete'), q),
    single: () => ((single = true), q),
    then: (resolve: (v: { data: unknown; error: null }) => void) => {
      let data: Row[] = [];
      if (action === 'select') data = rows.filter(match);
      if (action === 'insert') {
        data = ([] as Row[]).concat(payload!).map((r) => ({ id: `new-${++ids}`, ...r }));
        rows.push(...data);
      }
      if (action === 'update') {
        data = rows.filter(match);
        data.forEach((r) => Object.assign(r, payload));
      }
      if (action === 'delete') tables[table] = rows.filter((r) => !match(r));
      resolve({ data: single ? data[0] : data, error: null });
    },
  };
  return q;
}

const sortDump = vi.fn();

vi.mock('../api/_lib/http.js', async (original) => ({
  ...(await original<typeof import('../api/_lib/http.js')>()),
  admin: () => ({ from }),
}));
vi.mock('../api/_lib/sorter.js', () => ({ sortDump, sorterModel: () => 'test-model' }));

const { rescore } = await import('./rescore.js');

const U = 'user-1';
const part = (over: Row = {}) => ({
  label: 'dump',
  content: 'x',
  ambiguous: false,
  signals: { real: true, new: 3, specific: 3, reflective: 3, plan: false, heavy: false, risk: false },
  mission: null,
  mission_done_id: null,
  insight: null,
  box_object: null,
  note: null,
  pattern: null,
  command_detail: null,
  ...over,
});

function seed(count: number, day = '2026-11-10') {
  tables.ssx_dumps = [];
  tables.ssx_dump_parts = [];
  tables.ssx_ledger = [];
  tables.ssx_missions = [];
  tables.ssx_vault_items = [];
  tables.ssx_wishlist = [];
  for (let i = 0; i < count; i++) {
    const id = `d${i}`;
    const at = `${day}T1${i}:00:00Z`;
    tables.ssx_dumps.push({ id, user_id: U, raw_text: `dump number ${i} about something different ${i * 7919}`, created_at: at, client_meta: {} });
    tables.ssx_dump_parts.push({ id: `p${i}`, dump_id: id, user_id: U, label: 'dump', agent_version: 'fallback' });
    tables.ssx_ledger.push({ id: i, user_id: U, delta: 1, reason: 'base', dump_id: id, created_at: at });
  }
}

const rescoreRows = () => tables.ssx_ledger.filter((r) => r.reason === 'rescore');
const sum = (rows: Row[]) => rows.reduce((a, r) => a + (r.delta as number), 0);

beforeEach(() => {
  sortDump.mockReset();
  ids = 0;
});

describe('rescore', () => {
  it('dry run reports cubes and writes nothing', async () => {
    seed(2);
    sortDump.mockResolvedValue([part({ insight: 'an insight' })]);
    const before = JSON.stringify(tables);
    const lines: string[] = [];
    const result = await rescore(U, true, (l) => lines.push(l));
    expect(JSON.stringify(tables)).toBe(before);
    expect(result.dumps).toBe(2);
    expect(result.added).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain('nothing was written.');
    expect(lines.join('\n')).toContain('rescore +');
  });

  it('real run replaces parts, fills missions and vault, adds the difference', async () => {
    seed(1);
    sortDump.mockResolvedValue([
      part({
        signals: { real: true, new: 3, specific: 3, reflective: 3, plan: true, heavy: false, risk: false },
        mission: { title: 'fix the bike', next_steps: ['buy a tube'], updates_mission_id: null },
        insight: 'bikes need air',
      }),
      part({ label: 'wishlist', content: 'add a waterfall', signals: null, command_detail: 'a waterfall' }),
    ]);
    const dry = await rescore(U, true, () => {});
    const real = await rescore(U, false, () => {});
    expect(real.added).toBe(dry.added);

    expect(tables.ssx_dump_parts.map((p) => p.agent_version)).toEqual(['test-model', 'test-model']);
    expect(tables.ssx_missions).toHaveLength(1);
    expect(tables.ssx_vault_items).toHaveLength(1);
    expect(tables.ssx_wishlist).toHaveLength(1);
    // base 3 + new 5 + specific 3 + reflective 3 + plan 3 + first of day 3 (+5 if the rare drop hits), minus the 1 already paid
    expect([19, 24]).toContain(sum(rescoreRows()));
    expect(rescoreRows()[0]).toMatchObject({ dump_id: 'd0', user_id: U, rules_version: '0.1' });

    // nothing is left with agent_version = fallback, so a second run is a no-op
    const again = await rescore(U, false, () => {});
    expect(again.dumps).toBe(0);
  });

  it("respects the original day's cap and never goes negative", async () => {
    seed(8);
    sortDump.mockResolvedValue([part()]);
    await rescore(U, false, () => {});
    expect(sum(tables.ssx_ledger)).toBe(40);
    expect(rescoreRows().every((r) => (r.delta as number) > 0)).toBe(true);
  });

  it('a lower new score adds nothing', async () => {
    seed(1);
    tables.ssx_ledger[0].delta = 30;
    sortDump.mockResolvedValue([part()]);
    const result = await rescore(U, false, () => {});
    expect(result.added).toBe(0);
    expect(rescoreRows()).toHaveLength(0);
  });

  it('risk dumps get new parts and no rewards', async () => {
    seed(1);
    sortDump.mockResolvedValue([part({ signals: { real: true, new: 3, specific: 3, reflective: 3, plan: false, heavy: true, risk: true }, insight: 'x' })]);
    await rescore(U, false, () => {});
    expect(tables.ssx_dump_parts[0].agent_version).toBe('test-model');
    expect(rescoreRows()).toHaveLength(0);
    expect(tables.ssx_vault_items).toHaveLength(0);
  });

  it('a sorter failure leaves the dump untouched', async () => {
    seed(1);
    sortDump.mockRejectedValue(new Error('no key'));
    const result = await rescore(U, false, () => {});
    expect(result.failed).toBe(1);
    expect(tables.ssx_dump_parts[0].agent_version).toBe('fallback');
  });
});
