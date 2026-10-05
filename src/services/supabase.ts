import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const callbackSearch = typeof window === 'undefined' ? '' : window.location.search;
const callbackHash = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
const callbackParams = new URLSearchParams(callbackSearch);
const callbackHashParams = new URLSearchParams(callbackHash);
export const initialAuthCallbackError =
  callbackParams.get('error_description') || callbackHashParams.get('error_description') ||
  callbackParams.get('error') || callbackHashParams.get('error') || '';

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
