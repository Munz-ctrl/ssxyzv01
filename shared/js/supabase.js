

// js/supabase.js


import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const isDressUp = location.pathname.startsWith('/apps/tools/dressup/');
if (isDressUp) {
  console.log('[supabase.js] Skipped on DressUp route');
} else {
  const supabaseUrl = 'https://hoaztxbbeabvwewswmkl.supabase.co'; 
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYXp0eGJiZWFidndld3N3bWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNzk3OTIsImV4cCI6MjA2MjY1NTc5Mn0.EEpTUXXPkmrZdIdts-veWr16g6SAg6ZXGZiYl07rNqg'; 



  const supabase = createClient(supabaseUrl, supabaseKey);
  window.supabase = supabase;
  console.log('[supabase.js] Main site client ready');
}
