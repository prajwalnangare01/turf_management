import { store } from './store';
import { Court, DynamicSlot, DayType } from '../types/schema';
import { RedisLockService } from './redisLockService';

export class SlotEngine {
  /**
   * Helper to format HH:mm string from minutes from midnight
   */
  private static minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Helper to convert HH:mm string to minutes from midnight
   */
  private static timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
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
   */
  public static computeSlotsForCourt(court: Court, dateStr: string, currentSessionId?: string): DynamicSlot[] {
    const slots: DynamicSlot[] = [];
    const openMins = this.timeToMinutes(court.opening_time);
    const closeMins = this.timeToMinutes(court.closing_time);
    const stepMins = court.slot_duration_minutes;
    const bufferMins = court.buffer_minutes;

    const dayType = this.getDayType(dateStr);
    const pricingRules = store.getPricingRules().filter(r => r.court_id === court.id && r.day_type === dayType);
    const bookings = store.getBookings().filter(b => b.court_id === court.id && b.booking_date === dateStr);
    const blockedSlots = store.getBlockedSlots().filter(b => b.court_id === court.id && b.date === dateStr);
    const venue = store.getVenue();

    const now = new Date();
    const isToday = dateStr === now.toISOString().split('T')[0];
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const [year, month, dayNum] = dateStr.split('-').map(Number);
    const slotDate = new Date(year, month - 1, dayNum);
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
      const isPast = isToday && (cursor <= (currentMins + venue.min_notice_minutes));

      let slotPrice = baseRate;
      let isPeak = false;

      // 1. Check Pitch Peak Hours Configuration
      if (court.peak_enabled && court.peak_start_time && court.peak_end_time && court.peak_price_per_hour) {
        const pStart = this.timeToMinutes(court.peak_start_time);
        const pEnd = this.timeToMinutes(court.peak_end_time);
        if (cursor >= pStart && cursor < pEnd) {
          slotPrice = court.peak_price_per_hour;
          isPeak = true;
        }
      }

      // 2. Check Custom Granular Pricing Rules
      for (const rule of pricingRules) {
        const rStart = this.timeToMinutes(rule.start_time);
        const rEnd = this.timeToMinutes(rule.end_time);
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
        if (!b.start_time) return true; // Full day block
        const bStart = this.timeToMinutes(b.start_time);
        const bEnd = b.end_time ? this.timeToMinutes(b.end_time) : closeMins;
        return cursor >= bStart && cursor < bEnd;
      });

      // Check Existing DB Active Bookings (including multi-slot spans)
      const existingBooking = bookings.find(b => {
        if (b.status !== 'confirmed' && b.status !== 'pending_payment') return false;
        const bStart = this.timeToMinutes(b.start_time);
        const bEnd = this.timeToMinutes(b.end_time);
        return cursor >= bStart && cursor < bEnd;
      });

      // Check Redis Lock
      const redisLock = RedisLockService.getLock(court.id, dateStr, slotStart);

      // Determine visual status
      let status: DynamicSlot['status'] = 'available';
      let blockedReason: string | undefined;

      if (isPast) {
        status = 'past';
      } else if (blocked) {
        status = 'blocked';
        blockedReason = blocked.reason === 'maintenance' ? 'Maintenance' : 
                        blocked.reason === 'private_event' ? 'Private Event' : 'Owner Block';
      } else if (existingBooking) {
        status = existingBooking.source === 'online' ? 'booked_online' : 'booked_offline';
      } else if (redisLock) {
        status = 'locked';
      }

      slots.push({
        start_time: slotStart,
        end_time: slotEnd,
        price: slotPrice,
        is_peak: isPeak,
        status,
        lock_expires_at: redisLock?.expires_at,
        locked_by: redisLock?.locked_by,
        existing_booking: existingBooking,
        blocked_reason: blockedReason
      });

      // Advance cursor including buffer minutes turnover time
      cursor += stepMins + bufferMins;
    }

    return slots;
  }
}
