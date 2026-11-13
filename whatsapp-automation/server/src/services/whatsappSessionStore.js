// Supabase PostgreSQL-Backed Session Store & Sync Manager for WhatsApp Baileys Agent
// Enables $0 persistent disk stateless deployment (Render free tier, Docker, ephemeral containers)
import fs from 'fs';
import path from 'path';
import { BufferJSON, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { getSupabase } from '../data/supabaseClient.js';

export class WhatsAppSessionStore {
  static pendingWrites = new Map();
  static pendingDeletes = new Set();
  static debounceTimer = null;
  static DEBOUNCE_MS = 1200;

  /**
   * Hydrate session state from Supabase PostgreSQL into local working directory on boot
   * @param {string} sessionDir - Target local working directory (e.g. /tmp/whatsapp_session)
   * @returns {Promise<{ hydrated: boolean, count: number, error?: string }>}
   */
  static async hydrateSession(sessionDir) {
    const supabase = getSupabase();
    if (!supabase) {
      return { hydrated: false, count: 0, reason: 'supabase_not_configured' };
    }

    try {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('id, data');

      if (error) {
        // Table might not exist yet if user hasn't run the migration
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('ℹ️ [WhatsApp Session]: "whatsapp_sessions" table not found in Supabase. Running with local session storage. (Run supabase_setup.sql to enable cloud session persistence)');
        } else {
          console.warn('⚠️ [WhatsApp Session]: Could not query "whatsapp_sessions":', error.message);
        }
        return { hydrated: false, count: 0, error: error.message };
      }

      if (!Array.isArray(data) || data.length === 0) {
        return { hydrated: false, count: 0, reason: 'empty_session' };
      }

      let restoredCount = 0;
      for (const row of data) {
        if (!row.id || !row.data) continue;
        const filePath = path.join(sessionDir, row.id);
        const serialized = JSON.stringify(row.data);
        fs.writeFileSync(filePath, serialized, 'utf8');
        restoredCount++;
      }

      console.log(`📦 [WhatsApp Session]: Hydrated ${restoredCount} session keys from Supabase PostgreSQL into "${sessionDir}".`);
      return { hydrated: true, count: restoredCount };
    } catch (err) {
      console.warn('⚠️ [WhatsApp Session]: Hydration failed, using local files:', err.message);
      return { hydrated: false, count: 0, error: err.message };
    }
  }

  /**
   * Queue a file write for debounced batch upsert into Supabase
   * @param {string} fileName - File identifier (e.g. creds.json, pre-key-1.json)
   * @param {any} data - File data object containing buffers
   */
  static queueWrite(fileName, data) {
    this.pendingDeletes.delete(fileName);
    this.pendingWrites.set(fileName, data);
    this.scheduleDebouncedFlush();
  }

  /**
   * Queue a file deletion from Supabase
   * @param {string} fileName 
   */
  static queueDelete(fileName) {
    this.pendingWrites.delete(fileName);
    this.pendingDeletes.add(fileName);
    this.scheduleDebouncedFlush();
  }

  /**
   * Internal debounce timer scheduler
   */
  static scheduleDebouncedFlush() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush().catch(err => {
        console.warn('⚠️ [WhatsApp Session]: Debounced flush error:', err.message);
      });
    }, this.DEBOUNCE_MS);
    if (this.debounceTimer.unref) {
      this.debounceTimer.unref();
    }
  }

  /**
   * Immediately flush all queued writes & deletes to Supabase PostgreSQL in a single batch
   */
  static async flush() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const supabase = getSupabase();
    if (!supabase) {
      this.pendingWrites.clear();
      this.pendingDeletes.clear();
      return;
    }

    const toWrite = new Map(this.pendingWrites);
    const toDelete = new Set(this.pendingDeletes);
    this.pendingWrites.clear();
    this.pendingDeletes.clear();

    if (toWrite.size === 0 && toDelete.size === 0) {
      return;
    }

    try {
      if (toWrite.size > 0) {
        const records = [];
        for (const [id, data] of toWrite.entries()) {
          try {
            // Safely convert Buffer objects to JSONB-compatible structures using BufferJSON.replacer
            const safeObj = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
            records.push({
              id,
              data: safeObj,
              updated_at: new Date().toISOString()
            });
          } catch (encodeErr) {
            console.warn(`⚠️ [WhatsApp Session]: Error serializing key ${id}:`, encodeErr.message);
          }
        }

        if (records.length > 0) {
          const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert(records, { onConflict: 'id' });

          if (error && error.code !== '42P01') {
            console.warn('⚠️ [WhatsApp Session]: Batch upsert error:', error.message);
          }
        }
      }

      if (toDelete.size > 0) {
        const deleteIds = Array.from(toDelete);
        const { error } = await supabase
          .from('whatsapp_sessions')
          .delete()
          .in('id', deleteIds);

        if (error && error.code !== '42P01') {
          console.warn('⚠️ [WhatsApp Session]: Batch delete error:', error.message);
        }
      }
    } catch (err) {
      console.warn('⚠️ [WhatsApp Session]: Flush failed:', err.message);
    }
  }

  /**
   * Completely purge session records from Supabase and wipe local directory on disconnect/logout
   * @param {string} sessionDir 
   */
  static async clearSession(sessionDir) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingWrites.clear();
    this.pendingDeletes.clear();

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('whatsapp_sessions')
          .delete()
          .neq('id', '___dummy_preserve_token___');

        if (!error) {
          console.log('🧹 [WhatsApp Session]: Purged all session rows from Supabase "whatsapp_sessions" table.');
        }
      } catch (err) {
        console.warn('⚠️ [WhatsApp Session]: Could not clear Supabase session:', err.message);
      }
    }

    if (sessionDir && fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🧹 [WhatsApp Session]: Wiped local working folder "${sessionDir}".`);
      } catch (err) {
        console.warn('⚠️ [WhatsApp Session]: Could not delete local session directory:', err.message);
      }
    }
  }

  /**
   * High-level Auth State Factory combining Baileys useMultiFileAuthState with Supabase persistence
   * @param {string} sessionDir 
   * @returns {Promise<{ state: any, saveCreds: () => Promise<void> }>}
   */
  static async createSupabaseAuthState(sessionDir) {
    // 1. Hydrate from Supabase first if available
    await this.hydrateSession(sessionDir);

    // 2. Initialize standard Baileys multi-file auth state from hydrated files
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // 3. Wrap saveCreds to persist creds.json immediately to Supabase
    const wrappedSaveCreds = async () => {
      await saveCreds();
      if (state.creds) {
        this.queueWrite('creds.json', state.creds);
        await this.flush();
      }
    };

    // 4. Wrap keys.set to capture dynamic session, pre-key, and app-state key updates
    const originalSet = state.keys.set;
    state.keys.set = async (data) => {
      await originalSet(data);
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const fileName = `${category}-${id}.json`;
          if (value) {
            this.queueWrite(fileName, value);
          } else {
            this.queueDelete(fileName);
          }
        }
      }
    };

    return {
      state,
      saveCreds: wrappedSaveCreds
    };
  }
}
