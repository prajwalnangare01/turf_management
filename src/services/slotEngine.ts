import { store } from './store';
import { Court, DynamicSlot, DayType } from '../types/schema';
import { RedisLockService } from './redisLockService';
import { getVenueNow, getVenueDateString, getVenueMinutesFromMidnight } from '../utils/venueTime';

export class SlotEngine {
  /**
   * Helper to format HH:mm string from minutes from midnight (supports modulo 1440 for overnight hours)
   */
  private static minutesToTime(mins: number): string {
    const normalized = mins % 1440;
    const h = Math.floor(normalized / 60).toString().padStart(2, '0');
    const m = (normalized % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Helper to convert HH:mm string to minutes from midnight
   */
  private static timeToMinutes(timeStr: string): number {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Determine if a date is weekday or weekend
   */
  private static getDayType(dateStr: string): DayType {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    return (day === 0 || day === 6) ? 'weekend' : 'weekday';
  }

  /**
   * Compute exact available slots dynamically for a given court and date
   * CC-S01: Consecutive multi-hour buffer suppression
   * CC-S02: Server-side Asia/Kolkata clock skew protection
   * CC-DB1: Midnight operating hours crossover support (e.g. 06:00 to 02:00)
   */
  public static computeSlotsForCourt(court: Court, dateStr: string, currentSessionId?: string): DynamicSlot[] {
    const slots: DynamicSlot[] = [];
    const openMins = this.timeToMinutes(court.opening_time);
    let closeMins = this.timeToMinutes(court.closing_time);

    // CC-DB1: Handle midnight operating hours crossover (e.g., 06:00 AM to 02:00 AM next day)
    if (closeMins <= openMins) {
      closeMins += 1440;
    }

    const stepMins = court.slot_duration_minutes || 60;
    const bufferMins = court.buffer_minutes || 0;

    const dayType = this.getDayType(dateStr);
    const pricingRules = store.getPricingRules().filter(r => r.court_id === court.id && r.day_type === dayType);
    const bookings = store.getBookings().filter(b => b.court_id === court.id && b.booking_date === dateStr);
    const blockedSlots = store.getBlockedSlots().filter(b => {
      if (b.court_id !== court.id) return false;
      const bStartDate = b.date;
      const bEndDate = b.end_date || b.date;
      return dateStr >= bStartDate && dateStr <= bEndDate;
    });
    const venue = store.getVenue();

    // CC-S02: Use calibrated Asia/Kolkata venue time to prevent client machine clock skew
    const venueNow = getVenueNow();
    const localTodayStr = getVenueDateString();
    const currentMins = getVenueMinutesFromMidnight();

    const isPastDate = dateStr < localTodayStr;
    const isToday = dateStr === localTodayStr;

    // Check advance days limit
    const maxDate = new Date(venueNow);
    maxDate.setDate(maxDate.getDate() + (venue.max_advance_days || 14));
    const maxYear = maxDate.getFullYear();
    const maxMonth = String(maxDate.getMonth() + 1).padStart(2, '0');
    const maxDay = String(maxDate.getDate()).padStart(2, '0');
    const maxDateStr = `${maxYear}-${maxMonth}-${maxDay}`;
    const isBeyondAdvanceLimit = dateStr > maxDateStr;

    const [slotYear, slotMonth, dayNum] = dateStr.split('-').map(Number);
    const slotDate = new Date(slotYear, slotMonth - 1, dayNum);
    const dayOfWeek = slotDate.getDay(); // 0 = Sunday, 6 = Saturday

    let baseRate = court.base_price_per_hour;
    if (dayOfWeek === 6 && court.saturday_price_per_hour !== undefined) {
      baseRate = court.saturday_price_per_hour;
    } else if (dayOfWeek === 0 && court.sunday_price_per_hour !== undefined) {
      baseRate = court.sunday_price_per_hour;
    } else if ((dayOfWeek === 0 || dayOfWeek === 6) && court.weekend_price_per_hour !== undefined) {
      baseRate = court.weekend_price_per_hour;
    }

    let cursor = openMins;

    while (cursor + stepMins <= closeMins) {
      const slotStart = this.minutesToTime(cursor);
      const slotEnd = this.minutesToTime(cursor + stepMins);

      // Check if slot start time is in past or violates min_notice_minutes
      const isPast = isPastDate || (isToday && (cursor <= (currentMins + (venue.min_notice_minutes || 0))));

      let slotPrice = baseRate;
      let isPeak = false;

      // 1. Check Pitch Peak Hours Configuration
      if (court.peak_enabled && court.peak_start_time && court.peak_end_time && court.peak_price_per_hour) {
        const pStart = this.timeToMinutes(court.peak_start_time);
        let pEnd = this.timeToMinutes(court.peak_end_time);
        if (pEnd <= pStart) pEnd += 1440;
        if (cursor >= pStart && cursor < pEnd) {
          slotPrice = court.peak_price_per_hour;
          isPeak = true;
        }
      }

      // 2. Check Custom Granular Pricing Rules
      for (const rule of pricingRules) {
        const rStart = this.timeToMinutes(rule.start_time);
        let rEnd = this.timeToMinutes(rule.end_time);
        if (rEnd <= rStart) rEnd += 1440;
        // Ignore full-day legacy pricing rules so court's Saturday/Sunday rates take priority
        if (rStart <= openMins && rEnd >= closeMins) {
          continue;
        }
        if (cursor >= rStart && cursor < rEnd) {
          slotPrice = rule.price;
          isPeak = true;
          break;
        }
      }

      // Check Admin Blocked Slots
      const blocked = blockedSlots.find(b => {
        const bStartDate = b.date;
        const bEndDate = b.end_date || b.date;
        const bStartMins = b.start_time ? this.timeToMinutes(b.start_time) : openMins;
        const bEndMins = b.end_time ? this.timeToMinutes(b.end_time) : closeMins;

        if (bStartDate === bEndDate) {
          let effectiveEnd = bEndMins;
          if (effectiveEnd <= bStartMins) effectiveEnd += 1440;
          return cursor < effectiveEnd && (cursor + stepMins) > bStartMins;
        }

        if (dateStr === bStartDate) {
          return (cursor + stepMins) > bStartMins;
        }
        if (dateStr === bEndDate) {
          return cursor < bEndMins;
        }
        // Between start and end date: entire day is blocked
        return true;
      });

      // Check Existing DB Confirmed Bookings (permanently booked)
      const confirmedBooking = bookings.find(b => {
        if (b.status !== 'confirmed') return false;
        const bStart = this.timeToMinutes(b.start_time);
        let bEnd = this.timeToMinutes(b.end_time);
        if (bEnd <= bStart) bEnd += 1440;
        return cursor < bEnd && (cursor + stepMins) > bStart;
      });

      // Check Active 5-minute Pending Payment Holds (temporary hold)
      const pendingHold = bookings.find(b => {
        if (b.status !== 'pending_payment') return false;
        const createdMs = new Date(b.created_at).getTime();
        const ageMs = Date.now() - createdMs;
        if (ageMs >= 300 * 1000) return false; // 5-minute hold expired!
        const bStart = this.timeToMinutes(b.start_time);
        let bEnd = this.timeToMinutes(b.end_time);
        if (bEnd <= bStart) bEnd += 1440;
        return cursor < bEnd && (cursor + stepMins) > bStart;
      });

      // Check Redis Lock
      const redisLock = RedisLockService.getLock(court.id, dateStr, slotStart);

      // Determine visual status
      let status: DynamicSlot['status'] = 'available';
      let blockedReason: string | undefined;

      if (isPast) {
        status = 'past';
      } else if (isBeyondAdvanceLimit) {
        status = 'blocked';
        blockedReason = 'Beyond Advance Booking Limit';
      } else if (blocked) {
        status = 'blocked';
        blockedReason = blocked.reason === 'maintenance' ? 'Maintenance' : 
                        blocked.reason === 'private_event' ? 'Private Event' : 'Owner Block';
      } else if (confirmedBooking) {
        status = confirmedBooking.source === 'online' ? 'booked_online' : 'booked_offline';
      } else if (pendingHold) {
        status = 'locked';
      } else if (redisLock) {
        status = 'locked';
      }

      const effectiveLockExpiresAt = pendingHold 
        ? (new Date(pendingHold.created_at).getTime() + 300 * 1000)
        : redisLock?.expires_at;

      const effectiveLockedBy = pendingHold 
        ? (pendingHold.source === 'offline_whatsapp' ? 'WhatsApp Hold (5m)' : 'Customer Hold (5m)')
        : redisLock?.locked_by;

      slots.push({
        start_time: slotStart,
        end_time: slotEnd,
        price: slotPrice,
        is_peak: isPeak,
        status,
        lock_expires_at: effectiveLockExpiresAt,
        locked_by: effectiveLockedBy,
        existing_booking: confirmedBooking || pendingHold,
        blocked_reason: blockedReason
      });

      // CC-S01: Multi-Hour Consecutive Slot Booking Buffer Suppression
      // If the slot is inside an existing consecutive booking that continues further, do not inject turnover buffer!
      let effectiveBuffer = bufferMins;
      const refBooking = confirmedBooking || pendingHold;
      if (refBooking) {
        let bEnd = this.timeToMinutes(refBooking.end_time);
        if (bEnd <= this.timeToMinutes(refBooking.start_time)) bEnd += 1440;
        if (cursor + stepMins < bEnd) {
          effectiveBuffer = 0; // Suppress buffer inside consecutive booking
        }
      }

      cursor += stepMins + effectiveBuffer;
    }

    return slots;
  }
}
