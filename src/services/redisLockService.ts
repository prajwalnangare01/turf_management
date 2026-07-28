import { store } from './store';
import { SlotLock } from '../types/schema';

const LOCK_TTL_SECONDS = 300; // 5 minutes

export class RedisLockService {
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
        return { success: true, message: 'Lock extended', lock: existing };
      }
      const remainingSec = Math.ceil((existing.expires_at - Date.now()) / 1000);
      return { 
        success: false, 
        message: `This slot is currently held by another user (expires in ${remainingSec}s). Please select another slot.` 
      };
    }

    // Create new lock
    const newLock: SlotLock = {
      court_id: courtId,
      date,
      start_time: startTime,
      locked_by: sessionId,
      expires_at: Date.now() + (LOCK_TTL_SECONDS * 1000)
    };

    validLocks.push(newLock);
    store.setSlotLocks(validLocks);

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
   * Check if slot has active customer lock (used by Admin Offline Booking warning)
   */
  public static checkAdminConflict(courtId: string, date: string, startTime: string): { hasLock: boolean; lock?: SlotLock; remainingSeconds: number } {
    const lock = this.getLock(courtId, date, startTime);
    if (!lock) {
      return { hasLock: false, remainingSeconds: 0 };
    }
    const remainingSeconds = Math.max(0, Math.ceil((lock.expires_at - Date.now()) / 1000));
    return {
      hasLock: true,
      lock,
      remainingSeconds
    };
  }
}
