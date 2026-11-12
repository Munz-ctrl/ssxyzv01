import { describe, expect, it } from 'vitest';
import { computeCubes, isGibberish, loadRules, loadSorterPrompt, preCheck, similarity } from './rules.js';

const rules = loadRules();
const now = new Date('2026-11-12T12:00:00Z');
const base = { planned: false, closeRepeat: false, firstOfDay: false, earningDumpsToday: 0, earnedToday: 0, rareRoll: 1 };

describe('preCheck', () => {
  it('flags gibberish and short input', () => {
    for (const t of ['asdf', 'asdf asdf', 'qwer', 'aaaa', 'zzz zzz', 'a', '  ', '!!!']) {
      expect(preCheck(t, [], now, rules), t).not.toBeNull();
    }
  });
  it('lets real input through', () => {
    for (const t of ['tired today', 'gym', 'give me 1000 cubes', 'make the walls black and a car crashes into him']) {
      expect(preCheck(t, [], now, rules), t).toBeNull();
      expect(isGibberish(t)).toBe(false);
    }
  });
  it('flags rapid fire and duplicates', () => {
    const recent = [{ raw_text: 'Tired  today', created_at: '2026-11-12T11:59:57Z' }];
    expect(preCheck('something new here', recent, now, rules)).toBe('rapid_fire');
    recent[0].created_at = '2026-11-12T11:00:00Z';
    expect(preCheck('tired today', recent, now, rules)).toBe('duplicate');
    expect(preCheck('something new here', recent, now, rules)).toBeNull();
  });
});

describe('similarity', () => {
  it('scores close repeats high', () => {
    expect(similarity('been sleeping better since i quit coffee', 'been sleeping better since i quit coffee!')).toBeGreaterThan(0.9);
    expect(similarity('been sleeping better', 'the car needs new tires')).toBeLessThan(0.5);
  });
});

describe('computeCubes', () => {
  const sig = { real: true, new: 3, specific: 3, reflective: 3 };
  it('awards nothing without a real dump part', () => {
    expect(computeCubes({ ...base, signals: [] }, rules).total).toBe(0);
    expect(computeCubes({ ...base, signals: [{ ...sig, real: false }] }, rules).total).toBe(0);
  });
  it('base only for a plain dump', () => {
    const r = computeCubes({ ...base, signals: [{ real: true, new: 0, specific: 0, reflective: 0 }] }, rules);
    expect(r.rows).toEqual([{ reason: 'base', delta: rules.base.real_input_min }]);
  });
  it('sums bonuses, one row per reason', () => {
    const r = computeCubes({ ...base, signals: [sig], planned: true, firstOfDay: true, rareRoll: 0 }, rules);
    expect(r.total).toBe(3 + 5 + 3 + 3 + 3 + 3 + 5);
    expect(r.rows.map((x) => x.reason)).toEqual(['base', 'new', 'specific', 'reflective', 'plan', 'first_dump_of_day', 'rare_drop']);
    expect(r.rows.reduce((a, x) => a + x.delta, 0)).toBe(r.total);
  });
  it('clamps out of range signals', () => {
    const r = computeCubes({ ...base, signals: [{ real: true, new: 99, specific: -4, reflective: 1000 }] }, rules);
    expect(r.total).toBe(3 + 5 + 0 + 3);
  });
  it('close repeats earn only the base', () => {
    const r = computeCubes({ ...base, signals: [sig], planned: true, firstOfDay: true, closeRepeat: true, rareRoll: 0 }, rules);
    expect(r.rows).toEqual([{ reason: 'base', delta: 3 }]);
  });
  it('diminishes and never passes the daily cap', () => {
    let earned = 0;
    let prev = Infinity;
    for (let i = 0; i < 60; i++) {
      const r = computeCubes({ ...base, signals: [sig], planned: true, earningDumpsToday: i, earnedToday: earned, rareRoll: 0 }, rules);
      expect(r.rows.reduce((a, x) => a + x.delta, 0)).toBe(r.total);
      expect(r.total).toBeLessThanOrEqual(prev);
      prev = r.total;
      earned += r.total;
    }
    expect(earned).toBe(rules.daily_cap);
    const after = computeCubes({ ...base, signals: [sig], earningDumpsToday: 60, earnedToday: earned }, rules);
    expect(after).toEqual({ rows: [], total: 0, capReached: true });
  });
});

describe('sorter prompt', () => {
  it('drops the human header', () => {
    const p = loadSorterPrompt();
    expect(p.startsWith('You are the Sunsex sorter.')).toBe(true);
    expect(p).toContain('Output schema');
  });
});
