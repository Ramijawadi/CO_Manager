import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '%c[Co-Manager] Missing Supabase environment variables',
    'font-weight: bold; color: #ef4444; font-size: 14px;'
  );
  console.error(
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file\n' +
    'or in your Vercel project dashboard: Settings > Environment Variables.'
  );
}

export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseAnonKey ?? ''
);

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}
