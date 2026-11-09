import { store } from './store';
import { SlotLock } from '../types/schema';
import { SupabaseSyncService } from './supabaseSyncService';

const LOCK_TTL_SECONDS = 300; // 5 minutes hold time

export class RedisLockService {
  /**
   * Helper to convert HH:mm string to minutes from midnight
   */
  private static timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  // Purge expired locks from simulated Redis store
  private static cleanExpiredLocks(): SlotLock[] {
    const now = Date.now();
    const locks = store.getSlotLocks();
    const validLocks = locks.filter(l => l.expires_at > now);
    if (validLocks.length !== locks.length) {
      store.setSlotLocks(validLocks);
    }
    return validLocks;
  }

  /**
   * Acquire a 5-minute slot lock (SET key session_id NX EX 300)
   * Broadcasts to Supabase Realtime so Admin Panel and WhatsApp Agent lock it immediately!
   */
  public static acquireLock(
    courtId: string, 
    date: string, 
    startTime: string, 
    sessionId: string
  ): { success: boolean; message: string; lock?: SlotLock } {
    const validLocks = this.cleanExpiredLocks();
    
    // Check if lock exists for court_id + date + start_time
    const existing = validLocks.find(
      l => l.court_id === courtId && l.date === date && l.start_time === startTime
    );

    if (existing) {
      if (existing.locked_by === sessionId) {
        // Extend/refresh lock
        existing.expires_at = Date.now() + (LOCK_TTL_SECONDS * 1000);
        store.setSlotLocks(validLocks);
        SupabaseSyncService.syncSlotLockToSupabase(existing);
        return { success: true, message: 'Lock extended', lock: existing };
      }
      const remainingSec = Math.ceil((existing.expires_at - Date.now()) / 1000);
      return { 
        success: false, 
        message: `This slot is currently held by another user (expires in ${remainingSec}s). Please select another slot.` 
      };
    }

    // Create new lock (5-minute hold)
    const newLock: SlotLock = {
      court_id: courtId,
      date,
      start_time: startTime,
      locked_by: sessionId,
      expires_at: Date.now() + (LOCK_TTL_SECONDS * 1000)
    };

    validLocks.push(newLock);
    store.setSlotLocks(validLocks);

    // Sync to live Supabase and Backend API
    SupabaseSyncService.syncSlotLockToSupabase(newLock);
    if (typeof window !== 'undefined') {
      try {
        fetch('/api/slots/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courtId, date, startTime, lockedBy: sessionId, ttlSeconds: LOCK_TTL_SECONDS })
        }).catch(() => {});
      } catch (e) {}
    }

    return {
      success: true,
      message: 'Slot locked for 5 minutes',
      lock: newLock
    };
  }

  /**
   * Release lock when payment succeeds or user cancels
   */
  public static releaseLock(courtId: string, date: string, startTime: string, sessionId?: string) {
    const locks = store.getSlotLocks();
    const updated = locks.filter(
      l => !(l.court_id === courtId && l.date === date && l.start_time === startTime && (!sessionId || l.locked_by === sessionId))
    );
    store.setSlotLocks(updated);
    SupabaseSyncService.deleteSlotLockFromSupabase(courtId, date, startTime);
    if (typeof window !== 'undefined') {
      try {
        fetch('/api/slots/release-lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courtId, date, startTime, lockedBy: sessionId })
        }).catch(() => {});
      } catch (e) {}
    }
  }

  /**
   * Release all locks for a booking time range (e.g. 18:00 to 20:00)
   */
  public static releaseLocksForBooking(courtId: string, date: string, startTime: string, endTime: string, sessionId?: string) {
    const startMins = this.timeToMinutes(startTime);
    const endMins = this.timeToMinutes(endTime);
    const locks = store.getSlotLocks();

    const removedLocks: SlotLock[] = [];
    const updated = locks.filter(l => {
      if (l.court_id !== courtId || l.date !== date) return true;
      if (sessionId && l.locked_by !== sessionId) return true;
      const lMins = this.timeToMinutes(l.start_time);
      const isInside = lMins >= startMins && lMins < endMins;
      if (isInside) {
        removedLocks.push(l);
      }
      return !isInside;
    });

    store.setSlotLocks(updated);
    for (const l of removedLocks) {
      SupabaseSyncService.deleteSlotLockFromSupabase(l.court_id, l.date, l.start_time);
      if (typeof window !== 'undefined') {
        try {
          fetch('/api/slots/release-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courtId: l.court_id, date: l.date, startTime: l.start_time, lockedBy: sessionId })
          }).catch(() => {});
        } catch (e) {}
      }
    }
  }

  /**
   * Get active lock status for a slot
   */
  public static getLock(courtId: string, date: string, startTime: string): SlotLock | undefined {
    const validLocks = this.cleanExpiredLocks();
    return validLocks.find(
      l => l.court_id === courtId && l.date === date && l.start_time === startTime
    );
  }

  /**
   * Check if slot has active customer lock (used by Admin Offline Booking warning & Hold Modal)
   */
  public static checkAdminConflict(courtId: string, date: string, startTime: string): { hasLock: boolean; lock?: SlotLock; remainingSeconds: number } {
    const lock = this.getLock(courtId, date, startTime);
    if (lock) {
      const remainingSeconds = Math.max(0, Math.ceil((lock.expires_at - Date.now()) / 1000));
      return {
        hasLock: true,
        lock,
        remainingSeconds
      };
    }

    // Also check active pending holds from bookings
    const pending = store.getBookings().find(b => 
      b.court_id === courtId &&
      b.booking_date === date &&
      b.start_time === startTime &&
      b.status === 'pending_payment'
    );
    if (pending) {
      const expiresAt = new Date(pending.created_at).getTime() + 300 * 1000;
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      if (remainingSeconds > 0) {
        return {
          hasLock: true,
          lock: {
            court_id: courtId,
            date,
            start_time: startTime,
            locked_by: pending.customer_phone || pending.customer_name || 'Customer Hold',
            expires_at: expiresAt
          },
          remainingSeconds
        };
      }
    }

    return { hasLock: false, remainingSeconds: 0 };
  }
}
