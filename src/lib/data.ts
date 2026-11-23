import type { User } from '@supabase/supabase-js';
import surfaceConfig from '../../config/surfaces.json';
import { lifetimeEarned } from '../../shared/level';
import { parseRoom, type Room, type SurfaceTarget, type WallOp } from '../../shared/room';
import { ROOM_RULES } from '../scene/camera';
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
  insights: string[];
}

export interface ActiveAvatar {
  id: string;
  url: string;
  heightM: number;
  approved: boolean;
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
  avatar: ActiveAvatar | null; // null = the placeholder
  avatarJob: string | null; // id of an avatar job still working
  avatarCount: number; // avatars made so far; the first one is free
  room: Room; // walls and surfaces (the default backdrops until the player edits)
  surfaceJob: string | null; // id of a texture job still working
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

// Signed urls last an hour; reuse one so the room does not reload the texture on every refresh.
const signed = new Map<string, { url: string; until: number }>();
async function signedFileUrl(path: string): Promise<string> {
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const data = ok(await supabase.storage.from('ssx').createSignedUrl(path, 3600));
  if (!data) throw new Error('no avatar url');
  signed.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

type AvatarState = Pick<Game, 'avatar' | 'avatarJob' | 'avatarCount'>;

// The avatar is extra: if anything here fails (say the 02c migration is not applied yet),
// the room shows the placeholder and the rest of the game still loads.
async function loadAvatar(uid: string): Promise<AvatarState> {
  try {
    const [profile, job, count] = await Promise.all([
      supabase.from('ssx_profiles').select('active_avatar_id').eq('user_id', uid).maybeSingle(),
      supabase.from('ssx_jobs').select('id').eq('user_id', uid).eq('kind', 'avatar').eq('status', 'working').limit(1),
      supabase.from('ssx_avatars').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    ]);
    const activeId = ok(profile)?.active_avatar_id as string | null | undefined;
    let avatar: ActiveAvatar | null = null;
    if (activeId) {
      const row = ok(
        await supabase.from('ssx_avatars').select('id, image_path, height_m, approved').eq('id', activeId).maybeSingle(),
      ) as { id: string; image_path: string; height_m: number | null; approved: boolean } | null;
      if (row) {
        avatar = { id: row.id, url: await signedFileUrl(row.image_path), heightM: Number(row.height_m ?? 1.8), approved: row.approved };
      }
    }
    return { avatar, avatarJob: (ok(job) ?? [])[0]?.id ?? null, avatarCount: count.count ?? 0 };
  } catch {
    return { avatar: null, avatarJob: null, avatarCount: 0 };
  }
}

export const PRESETS = surfaceConfig.presets;
const PRESET_IDS = PRESETS.map((p) => p.id).filter((id) => id !== 'plain');

// The room is extra too: without the 02d migration it is the default room.
async function loadRoom(uid: string): Promise<Pick<Game, 'room' | 'surfaceJob'>> {
  try {
    const [profile, job] = await Promise.all([
      supabase.from('ssx_profiles').select('room').eq('user_id', uid).maybeSingle(),
      supabase.from('ssx_jobs').select('id').eq('user_id', uid).eq('kind', 'surface').eq('status', 'working').limit(1),
    ]);
    return { room: parseRoom(ok(profile)?.room ?? null, ROOM_RULES, uid, PRESET_IDS), surfaceJob: (job.data ?? [])[0]?.id ?? null };
  } catch {
    return { room: parseRoom(null, ROOM_RULES, uid, PRESET_IDS), surfaceJob: null };
  }
}

// Texture ref -> url the scene can load: presets are static files, the player's own are signed.
export async function textureUrls(room: Room): Promise<Record<string, string>> {
  const refs = new Set([room.floor_texture, room.wall_texture, ...room.walls.map((w) => w.texture)].filter((r): r is string => !!r));
  const out: Record<string, string> = {};
  await Promise.all(
    [...refs].map(async (ref) => {
      try {
        out[ref] = ref.startsWith('preset:') ? `/surfaces/${ref.slice(7)}.jpg` : await signedFileUrl(ref);
      } catch {
        // a texture that will not load leaves the plain color
      }
    }),
  );
  return out;
}

export async function loadGame(user: User): Promise<Game> {
  const uid = user.id;
  const [handle, count, wallet, lifetime, missions, vault, wishlist, dumps, avatarState, roomState] = await Promise.all([
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
    loadAvatar(uid),
    loadRoom(uid),
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
      insights: fromVault.filter((v) => v.kind === 'insight').map((v) => v.body),
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
    ...avatarState,
    ...roomState,
  };
}

export const SESSION_ENDED = 'signed out. sign in again to keep going.';

// The session is gone for good: drop it on this device so the sign-in screen shows.
async function sessionEnded(): Promise<never> {
  await supabase.auth.signOut({ scope: 'local' });
  throw new Error(SESSION_ENDED);
}

async function post<T = ApiResult>(path: string, body: Record<string, unknown>): Promise<T> {
  const call = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return sessionEnded();
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  };
  let res = await call();
  if (res.status === 401) {
    const { error } = await supabase.auth.refreshSession();
    if (error) return sessionEnded();
    res = await call();
    if (res.status === 401) return sessionEnded();
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error ?? 'something broke. try again.');
  return json as T;
}

export const sendDump = (text: string, inputType: 'text' | 'voice') =>
  post('/api/dump', { text, input_type: inputType, tz_offset_min: tzOffsetMin() });

export const completeMission = (missionId: string) => post('/api/mission/complete', { mission_id: missionId, tz_offset_min: tzOffsetMin() });

// avatar maker

export interface AvatarJobView {
  id: string;
  status: 'working' | 'done' | 'failed';
  step: string;
  error?: string;
  avatar?: { id: string; url: string; height_m: number };
}

const MAX_EDGE = 1536;

// Phone photos are huge: shrink to a jpeg before upload. Orientation follows the photo's exif.
async function shrink(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * s);
  canvas.height = Math.round(bitmap.height * s);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not read that photo'))), 'image/jpeg', 0.9),
  );
}

// Photos go straight to storage through one-time upload slots made by /api, then the job starts.
export async function startAvatar(photos: File[], heightM: number): Promise<{ job_id: string; cost: number }> {
  const blobs = await Promise.all(photos.map(shrink));
  const prep = await post<{ uploads: { path: string; token: string }[] }>('/api/avatar', { action: 'prepare', count: blobs.length });
  await Promise.all(
    prep.uploads.map(async ({ path, token }, i) => {
      const { error } = await supabase.storage.from('ssx').uploadToSignedUrl(path, token, blobs[i], { contentType: 'image/jpeg' });
      if (error) throw new Error('photo upload failed. try again.');
    }),
  );
  return post('/api/avatar', { action: 'create', photo_paths: prep.uploads.map((u) => u.path), height_m: heightM });
}

export const avatarStatus = (jobId: string) => post<AvatarJobView>('/api/avatar', { action: 'status', job_id: jobId });
export const keepAvatar = (avatarId: string) => post<{ ok: true }>('/api/avatar', { action: 'keep', avatar_id: avatarId });
export const discardAvatar = (avatarId: string) => post<{ ok: true }>('/api/avatar', { action: 'discard', avatar_id: avatarId });

// room edits (brief 02d)

export interface SurfaceJobView {
  id: string;
  status: 'working' | 'done' | 'failed';
  step: string;
  error?: string;
  room?: Room;
}

export const editWalls = (ops: WallOp[]) => post<{ room: Room }>('/api/room', { action: 'walls', ops });

export const setSurfacePreset = (target: SurfaceTarget, preset: string) =>
  post<{ room: Room }>('/api/room', { action: 'surface', target, preset });

export const describeSurface = (target: SurfaceTarget, prompt: string) =>
  post<{ job_id: string; cost: number }>('/api/room', { action: 'surface', target, prompt });

export async function photoSurface(target: SurfaceTarget, photo: File): Promise<{ job_id: string; cost: number }> {
  const blob = await shrink(photo, 1024);
  const slot = await post<{ path: string; token: string }>('/api/room', { action: 'photo' });
  const { error } = await supabase.storage.from('ssx').uploadToSignedUrl(slot.path, slot.token, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error('photo upload failed. try again.');
  return post('/api/room', { action: 'surface', target, photo_path: slot.path });
}

export const surfaceStatus = (jobId: string) => post<SurfaceJobView>('/api/room', { action: 'status', job_id: jobId });

// Stable pseudo coordinates until the map exists.
export function coordsFor(userId: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 16777619) >>> 0;
  return [(h % 199) - 99, ((h >>> 12) % 199) - 99];
}
