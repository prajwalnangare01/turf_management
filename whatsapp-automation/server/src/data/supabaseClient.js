// Supabase Client and Database Layer
import '../env.js';
import { createClient } from '@supabase/supabase-js';

const getUrl = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const getKey = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = () => {
  const url = getUrl();
  const key = getKey();
  return Boolean(url && key && !url.includes('your-supabase-project') && url.startsWith('http'));
};

let supabaseInstance = null;

export const getSupabase = () => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(getUrl(), getKey(), {
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
    if (!supabase) {
      return { connected: false, mode: 'error', error: 'Could not create Supabase client' };
    }
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
