// /apps/tools/dressup/js/sbClient.js
// Creates a Supabase *client* on window.sb (so dressup.js can safely use sb.from(...))

(function () {
 const SUPABASE_URL = 'https://hoaztxbbeabvwewswmkl.supabase.co'; 
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYXp0eGJiZWFidndld3N3bWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNzk3OTIsImV4cCI6MjA2MjY1NTc5Mn0.EEpTUXXPkmrZdIdts-veWr16g6SAg6ZXGZiYl07rNqg'; 


  // CDN exposes either `supabase` OR `window.supabase` as a namespace
  const ns = (typeof supabase !== "undefined" && supabase?.createClient)
    ? supabase
    : (window.supabase?.createClient ? window.supabase : null);

  if (!ns?.createClient) {
    console.error("[DressUp] Supabase CDN namespace not found. Make sure CDN is loaded before sbClient.js");
    return;
  }

  // Always create/overwrite the dressup client (safe + deterministic)
  window.sb = ns.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[DressUp] Supabase client ready -> window.sb");


  window.sb = ns.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.__dressup_sb = window.sb; // debug alias



})();


  