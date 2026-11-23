import { applyWallOps, parseRoom, RoomError, type Room } from '../../../shared/room.js';
import { admin, must } from '../http.js';
import { ToolError } from '../jobs.js';
import { presetIds, roomRules } from './roomConfig.js';

// The room layout lives on ssx_profiles.room (jsonb). Null = the default room (two backdrops).

export async function loadRoom(userId: string): Promise<Room> {
  const row = must(await admin().from('ssx_profiles').select('room').eq('user_id', userId).maybeSingle(), 'load room') as {
    room: unknown;
  } | null;
  return parseRoom(row?.room ?? null, roomRules(), userId, presetIds());
}

export async function saveRoom(userId: string, room: Room) {
  must(await admin().from('ssx_profiles').upsert({ user_id: userId, room }), 'save room');
}

// Tool: add, remove or resize wall segments. ops = [{ op: 'add' | 'remove' | 'height', edge, height? }].
export async function editWalls({ userId, ops }: { userId: string; ops: unknown }): Promise<Room> {
  const room = await loadRoom(userId);
  let next: Room;
  try {
    next = applyWallOps(room, ops, roomRules());
  } catch (err) {
    if (err instanceof RoomError) throw new ToolError(err.message);
    throw err;
  }
  await saveRoom(userId, next);
  return next;
}
