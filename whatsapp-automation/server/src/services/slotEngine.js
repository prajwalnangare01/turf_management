// Dynamic Slot Engine for TurfFlow Backend
// Mirrors logic in src/services/slotEngine.ts

import { store } from '../data/store.js';
import { LockService } from './lockService.js';
import { getVenueDateString, getVenueMinutesFromMidnight } from '../utils/venueTime.js';

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
    const blockedSlots = store.getBlockedSlots().filter(b => {
      if (b.court_id !== court.id) return false;
      const bStartDate = b.date;
      const bEndDate = b.end_date || b.date;
      return dateStr >= bStartDate && dateStr <= bEndDate;
    });
    const venue = store.getVenue();

    const now = new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    const slotDate = new Date(y, m - 1, d);
    const dayOfWeek = slotDate.getDay(); // 0 = Sun, 6 = Sat

    // Base pricing based on day of week
    let baseRate = court.base_price_per_hour;
    let baseOriginalRate = (court.original_price_per_hour && court.original_price_per_hour > court.base_price_per_hour)
      ? court.original_price_per_hour
      : undefined;

    if (dayOfWeek === 6 && court.saturday_price_per_hour !== undefined) {
      const satRate = court.saturday_price_per_hour;
      const satOffer = court.saturday_offer_price_per_hour;
      if (satOffer !== undefined && satOffer > 0 && satOffer !== satRate) {
        baseRate = Math.min(satRate, satOffer);
        baseOriginalRate = Math.max(satRate, satOffer);
      } else {
        baseRate = satRate;
        baseOriginalRate = undefined;
      }
    } else if (dayOfWeek === 0 && court.sunday_price_per_hour !== undefined) {
      const sunRate = court.sunday_price_per_hour;
      const sunOffer = court.sunday_offer_price_per_hour;
      if (sunOffer !== undefined && sunOffer > 0 && sunOffer !== sunRate) {
        baseRate = Math.min(sunRate, sunOffer);
        baseOriginalRate = Math.max(sunRate, sunOffer);
      } else {
        baseRate = sunRate;
        baseOriginalRate = undefined;
      }
    } else if ((dayOfWeek === 0 || dayOfWeek === 6) && court.weekend_price_per_hour !== undefined) {
      baseRate = court.weekend_price_per_hour;
      baseOriginalRate = undefined;
    }

    const todayStr = getVenueDateString();
    const isPastDate = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const currentMins = getVenueMinutesFromMidnight();

    let cursor = openMins;

    while (cursor + stepMins <= closeMins) {
      const slotStart = this.minutesToTime(cursor);
      const slotEnd = this.minutesToTime(cursor + stepMins);

      // Check if slot start time is in past or violates min_notice_minutes
      const isPast = isPastDate || (isToday && (cursor <= (currentMins + (venue.min_notice_minutes || 15))));

      let slotPrice = baseRate;
      let slotOriginalPrice = baseOriginalRate;
      let isPeak = false;

      // Peak Hours Check
      if (court.peak_enabled && court.peak_start_time && court.peak_end_time && court.peak_price_per_hour) {
        const pStart = this.timeToMinutes(court.peak_start_time);
        const pEnd = this.timeToMinutes(court.peak_end_time);
        if (cursor >= pStart && cursor < pEnd) {
          const pkRate = court.peak_price_per_hour;
          const pkOffer = court.peak_offer_price_per_hour;
          if (pkOffer !== undefined && pkOffer > 0 && pkOffer !== pkRate) {
            slotPrice = Math.min(pkRate, pkOffer);
            slotOriginalPrice = Math.max(pkRate, pkOffer);
          } else {
            slotPrice = pkRate;
            slotOriginalPrice = undefined;
          }
          isPeak = true;
        }
      }

      // Check Admin Blocks
      const isBlocked = blockedSlots.find(b => {
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
        return true;
      });

      // Check Confirmed Bookings (permanently booked)
      const confirmedBooking = bookings.find(b => {
        if (b.status !== 'confirmed') return false;
        const bStart = this.timeToMinutes(b.start_time);
        const bEnd = this.timeToMinutes(b.end_time);
        return cursor < bEnd && (cursor + stepMins) > bStart;
      });

      // Check Active 5-minute Pending Payment Holds (temporary hold)
      const pendingHold = bookings.find(b => {
        if (b.status !== 'pending_payment') return false;
        const ageMs = Date.now() - new Date(b.created_at).getTime();
        if (ageMs >= 300 * 1000) return false; // 5-minute hold expired!
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
      } else if (confirmedBooking) {
        status = confirmedBooking.source === 'online' ? 'booked_online' : 'booked_offline';
      } else if (pendingHold || isLocked) {
        status = 'locked';
      }

      const effectiveLockExpiresAt = pendingHold 
        ? (new Date(pendingHold.created_at).getTime() + 300 * 1000)
        : (isLocked ? (Date.now() + 300000) : undefined);

      const effectiveLockedBy = pendingHold 
        ? (pendingHold.source === 'offline_whatsapp' ? 'WhatsApp Hold (5m)' : 'Customer Hold (5m)')
        : (isLocked ? 'Customer Hold' : undefined);

      slots.push({
        start_time: slotStart,
        end_time: slotEnd,
        price: slotPrice,
        original_price: (slotOriginalPrice && slotOriginalPrice > slotPrice) ? slotOriginalPrice : undefined,
        is_peak: isPeak,
        status,
        locked_by: effectiveLockedBy,
        lock_expires_at: effectiveLockExpiresAt,
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
