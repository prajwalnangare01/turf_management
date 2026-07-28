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
    const date = new Date(dateStr);
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

    let cursor = openMins;

    while (cursor + stepMins <= closeMins) {
      const slotStart = this.minutesToTime(cursor);
      const slotEnd = this.minutesToTime(cursor + stepMins);

      // Check if slot start time is in past or violates min_notice_minutes
      const isPast = isToday && (cursor <= (currentMins + venue.min_notice_minutes));

      // Calculate price based on pricing rules or fallback base price
      let slotPrice = court.base_price_per_hour;
      let isPeak = false;

      for (const rule of pricingRules) {
        const rStart = this.timeToMinutes(rule.start_time);
        const rEnd = this.timeToMinutes(rule.end_time);
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

      // Check Existing DB Active Bookings
      const existingBooking = bookings.find(b => 
        b.start_time === slotStart && (b.status === 'confirmed' || b.status === 'pending_payment')
      );

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
