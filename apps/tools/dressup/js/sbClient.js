// /apps/tools/dressup/js/sbClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://hoaztxbbeabvwewswmkl.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
