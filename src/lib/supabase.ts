// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const rawUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.SUPABASE_URL as string | undefined) ||
  'https://obonqrzkadunrnvqnbtv.supabase.co';

const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isPlaceholderUrl = !rawUrl || rawUrl.includes('YOUR_PROJECT_REF');
const isPlaceholderKey = !rawKey || rawKey === 'YOUR_SUPABASE_ANON_KEY';

export const isSupabaseConfigured = !isPlaceholderUrl && !isPlaceholderKey;

const supabaseUrl = isPlaceholderUrl ? 'https://obonqrzkadunrnvqnbtv.supabase.co' : rawUrl;
// Fallback key format so createClient does not crash on initialization if unconfigured
const supabaseAnonKey = isPlaceholderKey
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock_unconfigured_key'
  : rawKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

