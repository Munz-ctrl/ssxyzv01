import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CubeRules {
  rules_version: string;
  base: { real_input_min: number; real_input_max: number };
  bonus: { new: number[]; specific: number[]; reflective: number[]; plan: number; first_dump_of_day: number };
  mission_completed: number;
  rare_drop: { chance: number; cubes: number };
  diminishing: { factor_per_dump_today: number; floor: number };
  daily_cap: number;
  repeat_similarity_threshold: number;
  spam: { min_meaningful_chars: number; min_seconds_between_dumps: number };
  agent?: { model?: string; context_dumps?: number };
}

let rules: CubeRules | null = null;
let prompt: string | null = null;

export function loadRules(): CubeRules {
  rules ??= JSON.parse(readFileSync(join(process.cwd(), 'config', 'cubes.json'), 'utf8')) as CubeRules;
  return rules;
}

export function loadSorterPrompt(): string {
  if (prompt === null) {
    const raw = readFileSync(join(process.cwd(), 'agent', 'sorter-prompt.md'), 'utf8');
    const cut = raw.indexOf('\n---');
    prompt = (cut >= 0 ? raw.slice(raw.indexOf('\n', cut + 1) + 1) : raw).trim();
  }
  return prompt;
}

// ---------- pre-check (no paid call) ----------

const VOWELS = /[aeiouy]/;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
const KEY_RUNS = KEY_ROWS.flatMap((r) => [r, [...r].reverse().join('')]);

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function gibberishToken(tok: string): boolean {
  if (tok.length < 3) return false;
  if (/^(.)\1+$/.test(tok)) return true;
  if (KEY_RUNS.some((r) => r.includes(tok))) return true;
  if (/^[a-z]+$/.test(tok) && (!VOWELS.test(tok) || /[^aeiouy]{6,}/.test(tok))) return true;
  return false;
}

export function isGibberish(text: string): boolean {
  const toks = normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!toks.length) return true;
  if (toks.every(gibberishToken)) return true;
  return toks.length >= 3 && new Set(toks).size === 1;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bx = bigrams(x);
  const by = bigrams(y);
  let hit = 0;
  for (const [g, n] of bx) hit += Math.min(n, by.get(g) ?? 0);
  return (2 * hit) / (x.length - 1 + (y.length - 1));
}

export interface RecentDump {
  raw_text: string | null;
  created_at: string;
}

export type SpamReason = 'too_short' | 'gibberish' | 'rapid_fire' | 'duplicate';

export function preCheck(text: string, recent: RecentDump[], now: Date, rules: CubeRules): SpamReason | null {
  const meaningful = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (meaningful < rules.spam.min_meaningful_chars) return 'too_short';
  if (isGibberish(text)) return 'gibberish';
  const last = recent[0];
  if (last && now.getTime() - new Date(last.created_at).getTime() < rules.spam.min_seconds_between_dumps * 1000) {
    return 'rapid_fire';
  }
  const norm = normalize(text);
  if (recent.some((d) => d.raw_text && normalize(d.raw_text) === norm)) return 'duplicate';
  return null;
}

// ---------- cube math ----------

export interface DumpSignals {
  real: boolean;
  new: number;
  specific: number;
  reflective: number;
}

export interface CubeInput {
  signals: DumpSignals[]; // one per `dump` part
  planned: boolean; // a mission was created or updated
  closeRepeat: boolean;
  firstOfDay: boolean;
  earningDumpsToday: number;
  earnedToday: number;
  rareRoll: number; // 0..1
}

export interface CubeResult {
  rows: { reason: string; delta: number }[];
  total: number;
  capReached: boolean;
}

const lvl = (n: number) => Math.max(0, Math.min(3, Math.round(Number(n) || 0)));

export function computeCubes(input: CubeInput, rules: CubeRules): CubeResult {
  const real = input.signals.filter((s) => s.real);
  if (!real.length) return { rows: [], total: 0, capReached: false };

  const top = (k: 'new' | 'specific' | 'reflective') => Math.max(...real.map((s) => lvl(s[k])));
  const n = top('new');
  const sp = top('specific');
  const re = top('reflective');
  const { real_input_min: lo, real_input_max: hi } = rules.base;

  const raw: [string, number][] = [['base', Math.min(hi, lo + Math.max(n, sp, re))]];
  if (!input.closeRepeat) {
    raw.push(['new', rules.bonus.new[n] ?? 0]);
    raw.push(['specific', rules.bonus.specific[sp] ?? 0]);
    raw.push(['reflective', rules.bonus.reflective[re] ?? 0]);
    if (input.planned) raw.push(['plan', rules.bonus.plan]);
    if (input.firstOfDay) raw.push(['first_dump_of_day', rules.bonus.first_dump_of_day]);
    if (input.rareRoll < rules.rare_drop.chance) raw.push(['rare_drop', rules.rare_drop.cubes]);
  }
  const parts = raw.filter(([, v]) => v > 0);
  const sum = parts.reduce((a, [, v]) => a + v, 0);

  const factor = Math.max(
    rules.diminishing.floor,
    Math.pow(rules.diminishing.factor_per_dump_today, input.earningDumpsToday),
  );
  const left = Math.max(0, rules.daily_cap - input.earnedToday);
  const wanted = Math.max(1, Math.round(sum * factor));
  const total = Math.min(wanted, left);

  // largest remainder split of `total` across reasons
  const shares = parts.map(([reason, v]) => ({ reason, exact: (v / sum) * total, delta: 0 }));
  for (const s of shares) s.delta = Math.floor(s.exact);
  let rest = total - shares.reduce((a, s) => a + s.delta, 0);
  for (const s of [...shares].sort((a, b) => b.exact - b.delta - (a.exact - a.delta))) {
    if (rest <= 0) break;
    s.delta += 1;
    rest -= 1;
  }
  return {
    rows: shares.filter((s) => s.delta > 0).map(({ reason, delta }) => ({ reason, delta })),
    total,
    capReached: total < wanted,
  };
}
