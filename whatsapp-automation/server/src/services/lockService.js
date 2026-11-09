// Concurrency Layer 1: Slot Lock Service
// Simulates / connects to Redis key: lock:{court_id}:{date}:{start_time} with 5-minute TTL

import { store } from '../data/store.js';
import { SupabaseService } from './supabaseService.js';

export class LockService {
  static makeKey(courtId, date, startTime) {
    return `${courtId}:${date}:${startTime}`;
  }

  /**
   * Acquire a temporary 5-minute lock on a slot
   * @param {string} courtId 
   * @param {string} date YYYY-MM-DD
   * @param {string} startTime HH:mm
   * @param {string} lockedBy sessionId or phone number
   * @param {number} ttlSeconds default 300 (5 minutes)
   * @returns {{ success: boolean, message?: string, expiresAt?: number }}
   */
  static acquireLock(courtId, date, startTime, lockedBy, ttlSeconds = 300) {
    this.cleanExpiredLocks();
    const key = this.makeKey(courtId, date, startTime);
    const now = Date.now();
    const existing = store.locks.get(key);

    if (existing && existing.expiresAt > now) {
      if (existing.lockedBy === lockedBy) {
        // Extend existing lock
        const newExpires = now + (ttlSeconds * 1000);
        store.locks.set(key, { lockedBy, expiresAt: newExpires, courtId, date, startTime });
        return { success: true, expiresAt: newExpires };
      }
      return {
        success: false,
        message: `Slot is temporarily held by another customer until ${new Date(existing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
      };
    }

    // Check if already booked in DB (only confirmed bookings, or active pending holds under 5 minutes)
    const activeBooking = store.getBookings().find(b => 
      b.court_id === courtId &&
      b.booking_date === date &&
      b.start_time === startTime &&
      (b.status === 'confirmed' || (b.status === 'pending_payment' && (now - new Date(b.created_at).getTime() < 300000)))
    );

    if (activeBooking) {
      if (activeBooking.status === 'confirmed') {
        return {
          success: false,
          message: `Slot is already booked.`
        };
      }
      return {
        success: false,
        message: `Slot is temporarily held for checkout until ${new Date(new Date(activeBooking.created_at).getTime() + 300000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
      };
    }

    const expiresAt = now + (ttlSeconds * 1000);
    store.locks.set(key, { lockedBy, expiresAt, courtId, date, startTime });

    // Persist lock to Supabase so website and Admin panel immediately show "Held"
    SupabaseService.insertSlotLock({
      court_id: courtId,
      date,
      start_time: startTime,
      locked_by: lockedBy,
      expires_at: expiresAt
    }).catch(() => {});

    return { success: true, expiresAt };
  }

  /**
   * Release a lock
   */
  static releaseLock(courtId, date, startTime, lockedBy) {
    const key = this.makeKey(courtId, date, startTime);
    const existing = store.locks.get(key);
    if (!existing) return true;

    if (!lockedBy || existing.lockedBy === lockedBy) {
      store.locks.delete(key);
      SupabaseService.deleteSlotLock(courtId, date, startTime).catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * Release all locks held by a user/phone
   */
  static releaseUserLocks(lockedBy) {
    let released = 0;
    for (const [key, val] of store.locks.entries()) {
      if (val.lockedBy === lockedBy) {
        store.locks.delete(key);
        released++;
      }
    }
    return released;
  }

  /**
   * Check if a slot is locked by someone else
   */
  static isLockedByOther(courtId, date, startTime, currentSessionId) {
    this.cleanExpiredLocks();
    const key = this.makeKey(courtId, date, startTime);
    const existing = store.locks.get(key);
    if (!existing) return false;
    if (existing.expiresAt <= Date.now()) {
      store.locks.delete(key);
      return false;
    }
    return existing.lockedBy !== currentSessionId;
  }

  static cleanExpiredLocks() {
    const now = Date.now();
    for (const [key, val] of store.locks.entries()) {
      if (val.expiresAt <= now) {
        store.locks.delete(key);
      }
    }
  }
}
