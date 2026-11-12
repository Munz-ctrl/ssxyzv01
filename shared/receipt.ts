export type Label = 'dump' | 'space_edit' | 'wishlist' | 'avatar_change' | 'sequel_image' | 'spam';

export const COMMAND_LABELS: Label[] = ['space_edit', 'avatar_change', 'sequel_image'];

export interface ReceiptLine {
  kind: 'head' | 'cubes' | 'line' | 'note' | 'spam' | 'risk' | 'level';
  text: string;
  note?: string;
  cubes?: number;
}

export interface ReceiptInput {
  risk?: boolean;
  parts: { label: Label; content: string | null; command_detail?: string | null }[];
  cubes: number;
  capReached?: boolean;
  missionsCreated?: { title: string; steps: number }[];
  missionsUpdated?: { title: string }[];
  missionsDone?: { title: string; cubes: number }[];
  insights?: number;
  patterns?: number;
  notes?: string[];
  wishlist?: number;
}

export const RISK_TEXT =
  'this sounds really heavy, and it matters. you do not have to carry it alone. ' +
  'if you might hurt yourself, call or text 988 (us) any time. ' +
  'if you are in immediate danger, call 911.';

const COMMAND_NAMES: Record<string, string> = {
  space_edit: 'space edit',
  avatar_change: 'avatar change',
  sequel_image: 'sequel image',
};

export function buildReceipt(input: ReceiptInput): ReceiptLine[] {
  if (input.risk) return [{ kind: 'risk', text: RISK_TEXT }];

  const lines: ReceiptLine[] = [];
  const dumpParts = input.parts.filter((p) => p.label === 'dump');
  const commands = input.parts.filter((p) => COMMAND_LABELS.includes(p.label));
  const wishlist = input.wishlist ?? input.parts.filter((p) => p.label === 'wishlist').length;
  const done = input.missionsDone ?? [];

  if (dumpParts.length || wishlist || done.length) {
    lines.push({ kind: 'head', text: '[ receipt ]' });
    if (dumpParts.length) {
      lines.push({ kind: 'cubes', text: `+${input.cubes} cubes`, cubes: input.cubes });
      if (input.capReached) lines.push({ kind: 'line', text: 'daily cap reached' });
    }
    for (const m of input.missionsCreated ?? []) {
      lines.push({ kind: 'line', text: `+1 mission: ${m.title}` });
      if (m.steps > 0) lines.push({ kind: 'line', text: `+${m.steps} next ${m.steps === 1 ? 'step' : 'steps'} attached` });
    }
    for (const m of input.missionsUpdated ?? []) lines.push({ kind: 'line', text: `mission updated: ${m.title}` });
    for (const m of done) {
      lines.push({ kind: 'line', text: `mission done: ${m.title}` });
      lines.push({ kind: 'cubes', text: `+${m.cubes} cubes`, cubes: m.cubes });
    }
    if (!dumpParts.length && input.capReached) lines.push({ kind: 'line', text: 'daily cap reached' });
    if (input.insights) lines.push({ kind: 'line', text: `+${input.insights} insight added to vault` });
    if (input.patterns) lines.push({ kind: 'line', text: `+${input.patterns} pattern noticed` });
    for (const note of input.notes ?? []) lines.push({ kind: 'note', text: '+1 note', note });
    if (wishlist) lines.push({ kind: 'line', text: `+${wishlist} added to wishlist` });
  }

  if (commands.length) {
    lines.push({ kind: 'head', text: '[ command ]' });
    for (const c of commands) {
      const detail = (c.command_detail || c.content || '').trim();
      lines.push({ kind: 'line', text: `${COMMAND_NAMES[c.label]}: ${detail}. saved for later` });
    }
  }

  if (!lines.length) lines.push({ kind: 'spam', text: '...' });
  return lines;
}

export const levelUpLine = (level: number): ReceiptLine => ({ kind: 'level', text: `level up: lv ${level}` });

export function missionDoneReceipt(title: string, cubes: number, capReached: boolean): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { kind: 'head', text: '[ receipt ]' },
    { kind: 'line', text: `mission done: ${title}` },
    { kind: 'cubes', text: `+${cubes} cubes`, cubes },
  ];
  if (capReached) lines.push({ kind: 'line', text: 'daily cap reached' });
  return lines;
}

// Start of the player's local day as a UTC instant. tzOffsetMin = minutes east of UTC.
export function dayStart(now: Date, tzOffsetMin: number): Date {
  const shifted = now.getTime() + tzOffsetMin * 60000;
  const floored = Math.floor(shifted / 86400000) * 86400000;
  return new Date(floored - tzOffsetMin * 60000);
}

export const MISSION_REASON = 'mission_completed';
