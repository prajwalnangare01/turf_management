// Concurrency Layer 1: Slot Lock Service
// Connects to Redis key: lock:{court_id}:{date}:{start_time} with 5-minute TTL & fallback to DB/Memory

import { store } from '../data/store.js';
import { SupabaseService } from './supabaseService.js';
import { RazorpayService } from './razorpayService.js';

let redisClient = null;

if (process.env.REDIS_URL && !process.env.REDIS_URL.includes('your_redis_password')) {
  import('redis').then(({ createClient }) => {
    try {
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', (err) => console.warn('⚠️ [Redis Lock Warning]:', err.message));
      client.connect().then(() => {
        redisClient = client;
        console.log('⚡ [Redis Distributed Locks]: Connected to Redis cluster successfully.');
      }).catch(err => {
        console.warn('ℹ️ [Redis Connect Notice]: Redis offline, using DB + Memory lock engine:', err.message);
      });
    } catch (e) {
      console.warn('ℹ️ [Redis Setup Notice]:', e.message);
    }
  }).catch(() => {});
}

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
    const effectiveTtlSeconds = Math.min(300, Math.max(1, Number(ttlSeconds) || 300));
    this.cleanExpiredLocks();
    const key = this.makeKey(courtId, date, startTime);
    const now = Date.now();
    const existing = store.locks.get(key);

    if (existing && existing.expiresAt > now) {
      if (existing.lockedBy === lockedBy) {
        // Extend existing lock
        const newExpires = now + (effectiveTtlSeconds * 1000);
        store.locks.set(key, { lockedBy, expiresAt: newExpires, courtId, date, startTime });
        return { success: true, expiresAt: newExpires };
      }
      return {
        success: false,
        message: `Slot is temporarily held by another customer until ${new Date(existing.expiresAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}.`
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
        message: `Slot is temporarily held for checkout until ${new Date(new Date(activeBooking.created_at).getTime() + 300000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}.`
      };
    }

    const expiresAt = now + (effectiveTtlSeconds * 1000);
    store.locks.set(key, { lockedBy, expiresAt, courtId, date, startTime });

    // Sync to Redis if available
    if (redisClient && redisClient.isOpen) {
      redisClient.set(`lock:${key}`, lockedBy, { EX: effectiveTtlSeconds }).catch(() => {});
    }

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
      if (redisClient && redisClient.isOpen) {
        redisClient.del(`lock:${key}`).catch(() => {});
      }
      SupabaseService.deleteSlotLock(courtId, date, startTime).catch(() => {});

      // Cancel any active Razorpay hosted payment link for pending bookings on this released slot
      const pendingBooking = store.getBookings().find(b =>
        b.court_id === courtId &&
        b.booking_date === date &&
        b.start_time === startTime &&
        b.status === 'pending_payment'
      );
      if (pendingBooking && pendingBooking.payment_link_id) {
        RazorpayService.cancelPaymentLink(pendingBooking.payment_link_id).catch(() => {});
      }

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

        const pendingBooking = store.getBookings().find(b =>
          b.court_id === val.courtId &&
          b.booking_date === val.date &&
          b.start_time === val.startTime &&
          b.status === 'pending_payment'
        );
        if (pendingBooking && pendingBooking.payment_link_id) {
          RazorpayService.cancelPaymentLink(pendingBooking.payment_link_id).catch(() => {});
        }
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
    const maxValidExpiresAt = now + 315 * 1000;
    for (const [key, val] of store.locks.entries()) {
      if (!Number.isFinite(val.expiresAt) || val.expiresAt <= now || val.expiresAt > maxValidExpiresAt) {
        store.locks.delete(key);

        const pendingBooking = store.getBookings().find(b =>
          b.court_id === val.courtId &&
          b.booking_date === val.date &&
          b.start_time === val.startTime &&
          b.status === 'pending_payment'
        );
        if (pendingBooking && pendingBooking.payment_link_id) {
          RazorpayService.cancelPaymentLink(pendingBooking.payment_link_id).catch(() => {});
        }
      }
    }
  }
}
