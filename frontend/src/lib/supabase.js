import { createClient } from '@supabase/supabase-js';

const runtimeConfig = window.__APP_CONFIG__ || {};

export const SUPABASE_URL = runtimeConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY =
  runtimeConfig.supabasePublishableKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    })
  : null;
