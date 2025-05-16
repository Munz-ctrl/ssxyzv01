// supabase.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://hoaztxbbeabvwewswmkl.supabase.co'; 
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYXp0eGJiZWFidndld3N3bWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNzk3OTIsImV4cCI6MjA2MjY1NTc5Mn0.EEpTUXXPkmrZdIdts-veWr16g6SAg6ZXGZiYl07rNqg'; 

export const supabase = createClient(supabaseUrl, supabaseKey);

// Optionally make it globally accessible
window.supabase = supabase;
