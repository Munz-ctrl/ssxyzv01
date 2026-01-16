// /js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const path = location.pathname;

// ✅ Skip on *all* DressUp public routes (rewrites) + direct folder route
const isDressUp =
  /^\/(dressup|stylist|mannequin|ssx-stylist)(\/|$)/.test(path) ||
  path.startsWith('/apps/tools/dressup/');

if (isDressUp) {
  console.log('[supabase.js] Skipped on DressUp route ', path);
} else {
  const supabaseUrl = 'https://hoaztxbbeabvwewswmkl.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYXp0eGJiZWFidndld3N3bWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNzk3OTIsImV4cCI6MjA2MjY1NTc5Mn0.EEpTUXXPkmrZdIdts-veWr16g6SAg6ZXGZiYl07rNqg'; 


  const supabase = createClient(supabaseUrl, supabaseKey);

  // If the rest of your site expects window.supabase, keep this:
  window.supabase = supabase;

  // If other modules import from this file, use an export-let pattern instead
  // (tell me if you import it anywhere and I’ll give you the exact version)
}
