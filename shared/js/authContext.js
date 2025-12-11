// /shared/js/authContext.js (concept)
import { supabase } from './supabase.js';

export async function getAuthContext() {
  // 1) Check session
  const { data: sess } = await supabase.auth.getSession();
  const authUser = sess?.session?.user || null;

  if (!authUser) {
    // No anon auto-create, caller must handle this
    return { supabase, authUser: null, appUser: null, mainPlayer: null };
  }

  // 2) Ensure app_users row
  const { data: appUserRow, error: appErr } = await supabase
    .from('app_users')
    .upsert({ id: authUser.id }, { onConflict: 'id' })
    .select()
    .single();

  if (appErr) {
    console.error('app_users upsert failed', appErr);
    throw appErr;
  }

  // 3) Load main player if any
  let mainPlayer = null;

  if (appUserRow?.primary_pid) {
    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('pid', appUserRow.primary_pid)
      .single();
    mainPlayer = player || null;
  }

  return { supabase, authUser, appUser: appUserRow, mainPlayer };
}
