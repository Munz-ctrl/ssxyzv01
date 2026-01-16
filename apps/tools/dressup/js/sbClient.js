// /apps/tools/dressup/js/sbClient.js
// Creates a Supabase *client* on window.sb (so dressup.js can safely use sb.from(...))

(function () {
 const SUPABASE_URL = 'https://hoaztxbbeabvwewswmkl.supabase.co'; 
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYXp0eGJiZWFidndld3N3bWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNzk3OTIsImV4cCI6MjA2MjY1NTc5Mn0.EEpTUXXPkmrZdIdts-veWr16g6SAg6ZXGZiYl07rNqg'; 


  // ✅ Use ONLY the Supabase CDN namespace (not window.supabase client)
const ns = (typeof supabase !== "undefined" && supabase?.createClient)
  ? supabase
  : null;

if (!ns?.createClient) {
  console.error("[DressUp] Supabase CDN namespace not found. Ensure the Supabase CDN script is loaded before sbClient.js");
  return;
}


// Always create/overwrite the dressup client (safe + deterministic)

function fetchWithTimeout(input, init = {}, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

window.sb = ns.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // ✅ isolate DressUp from other apps on the same domain
    storageKey: "sb-dressup-auth-token",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    // ✅ prevents “hang forever” network calls
    fetch: (input, init) => fetchWithTimeout(input, init, 60000),
  },
});

window.__dressup_sb = window.sb; // debug alias
console.log("[DressUp] Supabase client ready -> window.sb");




})();


  