// Dynamic Slot Engine for TurfFlow Backend
// Mirrors logic in src/services/slotEngine.ts

import { store } from '../data/store.js';
import { LockService } from './lockService.js';

export class SlotEngine {
  static timeToMinutes(timeStr) {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  static minutesToTime(mins) {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  static computeSlotsForCourt(court, dateStr, currentSessionId = '') {
    const slots = [];
    const openMins = this.timeToMinutes(court.opening_time);
    const closeMins = this.timeToMinutes(court.closing_time);
    const stepMins = court.slot_duration_minutes;
    const bufferMins = court.buffer_minutes || 0;

    const bookings = store.getBookings().filter(b => b.court_id === court.id && b.booking_date === dateStr);
    const blockedSlots = store.getBlockedSlots().filter(b => b.court_id === court.id && b.date === dateStr);
    const venue = store.getVenue();

    const now = new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    const slotDate = new Date(y, m - 1, d);
    const dayOfWeek = slotDate.getDay(); // 0 = Sun, 6 = Sat

    // Base pricing based on day of week
    let baseRate = court.base_price_per_hour;
    if (dayOfWeek === 6 && court.saturday_price_per_hour !== undefined) {
      baseRate = court.saturday_price_per_hour;
    } else if (dayOfWeek === 0 && court.sunday_price_per_hour !== undefined) {
      baseRate = court.sunday_price_per_hour;
    } else if ((dayOfWeek === 0 || dayOfWeek === 6) && court.weekend_price_per_hour !== undefined) {
      baseRate = court.weekend_price_per_hour;
    }

    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;
    const isPastDate = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let cursor = openMins;

    while (cursor + stepMins <= closeMins) {
      const slotStart = this.minutesToTime(cursor);
      const slotEnd = this.minutesToTime(cursor + stepMins);

      // Check if slot start time is in past or violates min_notice_minutes
      const isPast = isPastDate || (isToday && (cursor <= (currentMins + (venue.min_notice_minutes || 15))));

      let slotPrice = baseRate;
      let isPeak = false;

      // Peak Hours Check
      if (court.peak_enabled && court.peak_start_time && court.peak_end_time && court.peak_price_per_hour) {
        const pStart = this.timeToMinutes(court.peak_start_time);
        const pEnd = this.timeToMinutes(court.peak_end_time);
        if (cursor >= pStart && cursor < pEnd) {
          slotPrice = court.peak_price_per_hour;
          isPeak = true;
        }
      }

      // Check Admin Blocks
      const isBlocked = blockedSlots.find(b => {
        if (!b.start_time) return true; // Full day
        const bStart = this.timeToMinutes(b.start_time);
        const bEnd = b.end_time ? this.timeToMinutes(b.end_time) : closeMins;
        return cursor >= bStart && cursor < bEnd;
      });

      // Check Active Bookings
      const existingBooking = bookings.find(b => {
        if (b.status !== 'confirmed' && b.status !== 'pending_payment') return false;
        const bStart = this.timeToMinutes(b.start_time);
        const bEnd = this.timeToMinutes(b.end_time);
        return cursor < bEnd && (cursor + stepMins) > bStart;
      });

      // Check Concurrency Lock
      const isLocked = LockService.isLockedByOther(court.id, dateStr, slotStart, currentSessionId);

      let status = 'available';
      if (isPast) {
        status = 'past';
      } else if (isBlocked) {
        status = 'blocked';
      } else if (existingBooking) {
        status = existingBooking.source === 'online' ? 'booked_online' : 'booked_offline';
      } else if (isLocked) {
        status = 'locked';
      }

      slots.push({
        start_time: slotStart,
        end_time: slotEnd,
        price: slotPrice,
        is_peak: isPeak,
        status,
        court_id: court.id,
        court_name: court.name,
        date: dateStr,
        blocked_reason: isBlocked?.reason
      });

      cursor += stepMins + bufferMins;
    }

    return slots;
  }

  static getAvailableSlots(sportIdOrName, dateStr, currentSessionId = '') {
    const sports = store.getSports();
    let matchedSport = null;

    if (sportIdOrName) {
      const search = sportIdOrName.toLowerCase();
      matchedSport = sports.find(s => s.id === search || s.name.toLowerCase().includes(search));
    }

    let courts = store.getCourts().filter(c => c.status === 'active');
    if (matchedSport) {
      courts = courts.filter(c => c.sport_ids.includes(matchedSport.id));
    }

    const result = [];
    for (const court of courts) {
      const slots = this.computeSlotsForCourt(court, dateStr, currentSessionId);
      result.push({
        court_id: court.id,
        court_name: court.name,
        sport_ids: court.sport_ids,
        date: dateStr,
        slots: slots.filter(s => s.status === 'available'),
        all_slots: slots
      });
    }

    return {
      sport: matchedSport,
      date: dateStr,
      courts: result
    };
  }
}
