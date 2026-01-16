// /js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export let siteSb = null;

const isDressUp = location.pathname.startsWith('/apps/tools/dressup/');
if (isDressUp) {
  console.log('[supabase.js] Skipped on DressUp route');
} else {
  const supabaseUrl = 'https://hoaztxbbeabvwewswmkl.supabase.co';
  const supabaseKey = 'YOUR_ANON_KEY';

  siteSb = createClient(supabaseUrl, supabaseKey);

  // ✅ do NOT overwrite window.supabase (CDN namespace)
  window.siteSb = siteSb;

  console.log('[supabase.js] Main site client ready -> window.siteSb');
}
