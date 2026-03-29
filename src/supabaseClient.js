import { createClient } from '@supabase/supabase-js';

// Make sure to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
