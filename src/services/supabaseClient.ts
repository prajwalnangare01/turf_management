import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'turfflow_supabase_config';

interface StoredConfig {
  url: string;
  anonKey: string;
}

/**
 * Get current configured Supabase URL & Anon Key
 * Priority: 1. LocalStorage runtime override (Settings Panel) -> 2. Vite Environment Variables
 */
export function getSupabaseConfig(): { url: string; anonKey: string; isCustom: boolean } {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: StoredConfig = JSON.parse(stored);
        if (parsed.url && parsed.anonKey) {
          return {
            url: parsed.url.trim(),
            anonKey: parsed.anonKey.trim(),
            isCustom: true
          };
        }
      }
    }
  } catch (e) {
    // Ignore storage parsing error
  }

  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  return {
    url: envUrl.trim(),
    anonKey: envKey.trim(),
    isCustom: false
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(
    url && 
    anonKey && 
    !url.includes('your-supabase-project') &&
    url.startsWith('http')
  );
}

let cachedClient: SupabaseClient | null = null;
let currentClientKey = '';

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url, anonKey } = getSupabaseConfig();
  const keyIdentifier = `${url}::${anonKey}`;

  if (cachedClient && currentClientKey === keyIdentifier) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    currentClientKey = keyIdentifier;
    return cachedClient;
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return null;
  }
}

/**
 * Save custom credentials from SettingsPanel UI and re-instantiate client
 */
export function setSupabaseConfig(url: string, anonKey: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
  }
  cachedClient = null;
  currentClientKey = '';
}

/**
 * Clear custom credentials and revert to defaults
 */
export function clearSupabaseConfig() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  cachedClient = null;
  currentClientKey = '';
}

/**
 * Test connectivity against live Supabase instance
 */
export async function testSupabaseConnection(): Promise<{ 
  connected: boolean; 
  message: string; 
  venue?: any; 
  error?: string;
  stats?: { courts: number; bookings: number; customers: number };
}> {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      message: 'Supabase credentials not configured. Operating in local in-memory fallback mode.'
    };
  }

  const client = getSupabase();
  if (!client) {
    return {
      connected: false,
      message: 'Failed to initialize Supabase client instance.'
    };
  }

  try {
    const { data: venues, error: vErr } = await client
      .from('venues')
      .select('id, name, timezone, contact_phone')
      .limit(1);

    if (vErr) {
      return {
        connected: false,
        message: `Supabase query error: ${vErr.message}`,
        error: vErr.message
      };
    }

    const [courtsRes, bookingsRes, custRes] = await Promise.all([
      client.from('courts').select('id', { count: 'exact', head: true }),
      client.from('bookings').select('id', { count: 'exact', head: true }),
      client.from('customers').select('id', { count: 'exact', head: true })
    ]);

    return {
      connected: true,
      message: 'Successfully connected to live Supabase PostgreSQL database!',
      venue: venues?.[0] || null,
      stats: {
        courts: courtsRes.count || 0,
        bookings: bookingsRes.count || 0,
        customers: custRes.count || 0
      }
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Connection exception: ${err.message || 'Unknown network error'}`,
      error: err.message
    };
  }
}
