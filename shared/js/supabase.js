import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://hoaztxbbeabvwewswmkl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYXp0eGJiZWFidndld3N3bWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNzk3OTIsImV4cCI6MjA2MjY1NTc5Mn0.EEpTUXXPkmrZdIdts-veWr16g6SAg6ZXGZiYl07rNqg';

// Skip on DressUp routes — DressUp uses its own isolated client (window.sb)
const isDressUp = /^\/(dressup|stylist|mannequin|ssx-stylist)(\/|$)/.test(location.pathname)
  || location.pathname.startsWith('/apps/tools/dressup/');

let supabase;

if (isDressUp) {
  console.log('[supabase.js] Skipped on DressUp route:', location.pathname);
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabase = supabase;
}

export { supabase };
