// /js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const isDressUp = location.pathname.startsWith('/apps/tools/dressup/');
if (isDressUp) {
  console.log('[supabase.js] Skipped on DressUp route');
} else {
  const supabaseUrl = 'https://hoaztxbbeabvwewswmkl.supabase.co';
  const supabaseKey = 'YOUR_ANON_KEY';

  const supabase = createClient(supabaseUrl, supabaseKey);

  // If the rest of your site expects window.supabase, keep this:
  window.supabase = supabase;

  // If other modules import from this file, use an export-let pattern instead
  // (tell me if you import it anywhere and I’ll give you the exact version)
}
