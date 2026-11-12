import { supabase } from './supabase.js';

/**
 * Returns current auth state + linked player (if any).
 * Uses the shared supabase client — do NOT call from DressUp routes.
 *
 * @returns {{ supabase, authUser, player }}
 *   authUser — Supabase auth user object, or null
 *   player   — players row where owner_id = auth user id, or null
 */
export async function getAuthContext() {
  const { data: sess } = await supabase.auth.getSession();
  const authUser = sess?.session?.user || null;

  if (!authUser) {
    return { supabase, authUser: null, player: null };
  }

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('owner_id', authUser.id)
    .maybeSingle();

  return { supabase, authUser, player: player || null };
}
