// Supabase Client and Database Layer
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  return Boolean(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-supabase-project'));
};

let supabaseInstance = null;

export const getSupabase = () => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseInstance;
};

/**
 * Test connectivity to Supabase
 */
export async function testSupabaseConnection() {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      mode: 'in-memory-fallback',
      message: 'Supabase credentials not configured in environment. Running in resilient in-memory storage mode.'
    };
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('venues').select('id, name').limit(1);
    if (error) {
      return {
        connected: false,
        mode: 'error',
        error: error.message
      };
    }
    return {
      connected: true,
      mode: 'supabase-production',
      venue: data?.[0] || null,
      message: 'Successfully connected to live Supabase PostgreSQL database!'
    };
  } catch (err) {
    return {
      connected: false,
      mode: 'error',
      error: err.message
    };
  }
}
