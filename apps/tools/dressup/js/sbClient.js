// /apps/tools/dressup/js/sbClient.js
// UMD-safe: relies on global `supabase` from the CDN script tag in dressup.html

(function () {
 
  const SUPABASE_URL = 'https://hoaztxbbeabvwewswmkl.supabase.co'; 
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYXp0eGJiZWFidndld3N3bWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNzk3OTIsImV4cCI6MjA2MjY1NTc5Mn0.EEpTUXXPkmrZdIdts-veWr16g6SAg6ZXGZiYl07rNqg'; 


  if (!window.supabase && typeof supabase !== "undefined" && supabase.createClient) {
    window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[DressUp] Supabase client ready");
  } else if (window.supabase) {
    console.log("[DressUp] Supabase client already exists");
  } else {
    console.warn("[DressUp] Supabase CDN not loaded; client not created");
  }
})();


