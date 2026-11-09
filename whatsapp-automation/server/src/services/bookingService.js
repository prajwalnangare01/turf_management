// Booking Service: Orchestrates bookings, payments, and cancellations
import { store } from '../data/store.js';
import { LockService } from './lockService.js';
import { RazorpayService } from './razorpayService.js';
import { NotificationService } from './notificationService.js';
import { EmailService } from './emailService.js';
import { SmsService } from './smsService.js';
import { SlotEngine } from './slotEngine.js';
import { SupabaseService } from './supabaseService.js';

export class BookingService {
  /**
   * Step 1: Initiate booking from WhatsApp
   * Acquires concurrency lock, creates pending booking, generates Razorpay payment link
   */
  static initiateBooking({ courtId, sportId, date, startTime, customerName, customerPhone }) {
    const courts = store.getCourts();
    const court = courts.find(c => c.id === courtId || c.name.toLowerCase().includes(courtId.toLowerCase()));
    if (!court) {
      return { success: false, message: `Court '${courtId}' not found.` };
    }

    const durationMins = court.slot_duration_minutes || 60;
    const startMins = SlotEngine.timeToMinutes(startTime);
    const endTime = SlotEngine.minutesToTime(startMins + durationMins);

    // Concurrency Layer 1: Acquire Slot Lock
    const lockResult = LockService.acquireLock(court.id, date, startTime, customerPhone, 300);
    if (!lockResult.success) {
      return {
        success: false,
        message: lockResult.message || `Slot ${startTime} on ${date} is already locked or booked.`
      };
    }

    // Concurrency Layer 2: Postgres Unique Constraint Check
    const activeConflict = store.getBookings().find(b => 
      b.court_id === court.id &&
      b.booking_date === date &&
      (b.status === 'confirmed' || b.status === 'pending_payment') &&
      b.start_time === startTime
    );

    if (activeConflict) {
      LockService.releaseLock(court.id, date, startTime, customerPhone);
      return {
        success: false,
        message: `Slot is already booked (${activeConflict.booking_ref}).`
      };
    }

    // Determine slot price
    const slots = SlotEngine.computeSlotsForCourt(court, date, customerPhone);
    const slotData = slots.find(s => s.start_time === startTime);
    const finalPrice = slotData ? slotData.price : court.base_price_per_hour;

    // Get or register customer
    const customer = store.getOrCreateCustomer(customerName, customerPhone);

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingRef = `TRF-${date.replace(/-/g, '')}-${randomSuffix}`;
    const now = new Date().toISOString();

    const newBooking = {
      id: `bk-${Date.now()}-${randomSuffix}`,
      booking_ref: bookingRef,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      court_id: court.id,
      court_name: court.name,
      sport_id: sportId || court.sport_ids[0],
      booking_date: date,
      start_time: startTime,
      end_time: endTime,
      source: 'offline_whatsapp',
      status: 'pending_payment',
      total_amount: finalPrice,
      discount_amount: 0,
      notes: 'Initiated via WhatsApp AI Agent',
      created_at: now,
      updated_at: now
    };

    store.getBookings().push(newBooking);

    // Concurrently persist to Supabase PostgreSQL database
    SupabaseService.upsertCustomer(customer).then(dbCust => {
      if (dbCust?.id) {
        newBooking.customer_id = dbCust.id;
      }
      return SupabaseService.insertBooking(newBooking);
    }).catch(err => console.warn('Supabase booking persistence error:', err.message));

    // Generate Razorpay Payment Link
    const payment = RazorpayService.createPaymentLink({
      bookingRef,
      amount: finalPrice,
      customerName: customer.name,
      customerPhone: customer.phone,
      courtName: court.name,
      date,
      startTime
    });

    return {
      success: true,
      booking: newBooking,
      payment,
      lockExpiresAt: lockResult.expiresAt,
      message: `Slot reserved for 5 minutes! Complete payment using the link below.`
    };
  }

  /**
   * Step 2: Confirm booking upon payment capture
   */
  static confirmBooking(bookingRef, paymentId = '') {
    const booking = store.getBookings().find(b => b.booking_ref === bookingRef || b.id === bookingRef);
    if (!booking) {
      return { success: false, message: `Booking '${bookingRef}' not found.` };
    }

    if (booking.status === 'confirmed') {
      return { success: true, booking, alreadyConfirmed: true };
    }

    booking.status = 'confirmed';
    booking.updated_at = new Date().toISOString();
    booking.gateway_payment_id = paymentId || `pay_${Date.now()}`;

    // Release lock (now permanently guarded by status = 'confirmed')
    LockService.releaseLock(booking.court_id, booking.booking_date, booking.start_time, booking.customer_phone);

    // Update customer stats
    const customer = store.getCustomers().find(c => c.id === booking.customer_id);
    if (customer) {
      customer.total_bookings = (customer.total_bookings || 0) + 1;
      customer.total_spent = (customer.total_spent || 0) + booking.total_amount;
    }

    // Persist confirmation and payment to Supabase PostgreSQL database
    SupabaseService.updateBooking(booking.id, {
      status: 'confirmed',
      gateway_payment_id: booking.gateway_payment_id,
      updated_at: booking.updated_at
    }).catch(err => console.warn('Supabase updateBooking error:', err.message));

    if (customer) {
      SupabaseService.upsertCustomer(customer).catch(err => console.warn('Supabase upsertCustomer error:', err.message));
    }

    SupabaseService.insertPayment({
      id: `pay-${Date.now()}`,
      booking_id: booking.id,
      amount: booking.total_amount,
      method: 'upi',
      gateway: 'razorpay',
      gateway_payment_id: booking.gateway_payment_id,
      status: 'captured',
      created_at: booking.updated_at
    }).catch(err => console.warn('Supabase insertPayment error:', err.message));

    // Trigger Outbound WhatsApp Confirmation
    NotificationService.sendBookingConfirmation(booking);

    // Trigger Outbound Resend Email Confirmation & Gate Pass if customer has email
    EmailService.sendBookingConfirmation(booking).catch(err => {
      console.warn('Backend Resend confirmation email error:', err.message);
    });

    // Trigger Outbound SMS Confirmation with 4-digit Gate Pass
    SmsService.sendBookingConfirmation(booking).catch(err => {
      console.warn('Backend SMS confirmation error:', err.message);
    });

    return {
      success: true,
      booking,
      message: 'Booking confirmed successfully!'
    };
  }

  /**
   * Search / Lookup bookings by phone or reference
   */
  static lookupBookings({ phone, ref, onlyPending = true }) {
    let bookings = store.getBookings();

    if (ref) {
      const cleanRef = ref.trim().toUpperCase();
      bookings = bookings.filter(b => b.booking_ref === cleanRef || b.id === cleanRef);
    } else if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
      bookings = bookings.filter(b => {
        let bPhone = b.customer_phone;
        if (!bPhone && b.customer_id) {
          const cust = store.getCustomers().find(c => c.id === b.customer_id);
          bPhone = cust?.phone;
        }
        return bPhone ? bPhone.replace(/[^0-9]/g, '').slice(-10) === cleanPhone : false;
      });

      if (onlyPending) {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        bookings = bookings.filter(b => {
          // Never show cancelled or refunded
          if (b.status === 'cancelled' || b.status === 'refunded') {
            return false;
          }
          // Never show completed or no-show
          if (b.status === 'completed' || b.status === 'no_show') {
            return false;
          }
          // For confirmed bookings, if date/time has already passed, it is completed
          if (b.status === 'confirmed') {
            if (b.booking_date < todayStr) return false;
            if (b.booking_date === todayStr && (b.end_time || b.start_time) < currentHourMin) return false;
          }
          // Keep active upcoming bookings
          return b.status === 'pending_payment' || b.status === 'confirmed';
        });
      }
    }

    return bookings.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /**
   * Calculate tiered refund for a booking
   */
  static calculateRefund(booking) {
    const [y, m, d] = booking.booking_date.split('-').map(Number);
    const [hr, min] = booking.start_time.split(':').map(Number);
    const matchTime = new Date(y, m - 1, d, hr, min).getTime();
    const now = Date.now();
    const hoursRemaining = (matchTime - now) / (1000 * 60 * 60);

    let refundPct = 0;
    if (hoursRemaining >= 24) {
      refundPct = 100;
    } else if (hoursRemaining >= 6) {
      refundPct = 50;
    } else {
      refundPct = 0;
    }

    const refundAmount = Math.round((booking.total_amount * refundPct) / 100);
    return { hoursRemaining: Math.round(hoursRemaining * 10) / 10, refundPct, refundAmount };
  }

  /**
   * Cancel booking
   */
  static cancelBooking(bookingRef, phone, reason = 'Customer request via WhatsApp') {
    const booking = store.getBookings().find(b => b.booking_ref === bookingRef);
    if (!booking) {
      return { success: false, message: `Booking ${bookingRef} not found.` };
    }

    if (booking.status === 'cancelled' || booking.status === 'refunded') {
      return { success: false, message: `Booking ${bookingRef} is already cancelled.` };
    }

    const { refundPct, refundAmount, hoursRemaining } = this.calculateRefund(booking);

    booking.status = 'cancelled';
    booking.refund_amount = refundAmount;
    booking.refund_reason = reason;
    booking.refunded_at = new Date().toISOString();
    booking.updated_at = new Date().toISOString();

    // Release any lingering lock
    LockService.releaseLock(booking.court_id, booking.booking_date, booking.start_time, booking.customer_phone);

    // Update customer metrics
    const customer = store.getCustomers().find(c => c.id === booking.customer_id);
    if (customer && refundAmount > 0) {
      customer.total_spent = Math.max(0, customer.total_spent - refundAmount);
    }

    // Persist cancellation to Supabase PostgreSQL database
    SupabaseService.updateBooking(booking.id, {
      status: 'cancelled',
      refund_amount: refundAmount,
      refund_reason: reason,
      refunded_at: booking.refunded_at,
      updated_at: booking.updated_at
    }).catch(err => console.warn('Supabase updateBooking cancellation error:', err.message));

    if (customer && refundAmount > 0) {
      SupabaseService.upsertCustomer(customer).catch(err => console.warn('Supabase upsertCustomer refund error:', err.message));
    }

    // Send WhatsApp cancellation notice
    NotificationService.sendCancellationNotice(booking, refundAmount, refundPct);

    return {
      success: true,
      booking,
      hoursRemaining,
      refundPct,
      refundAmount,
      message: `Booking ${bookingRef} cancelled. Refund of ₹${refundAmount} (${refundPct}%) initiated.`
    };
  }

  /**
   * Reschedule booking
   */
  static rescheduleBooking(bookingRef, newDate, newStartTime) {
    const booking = store.getBookings().find(b => b.booking_ref === bookingRef);
    if (!booking) {
      return { success: false, message: `Booking ${bookingRef} not found.` };
    }

    if (booking.status !== 'confirmed') {
      return { success: false, message: `Only confirmed bookings can be rescheduled (Current status: ${booking.status}).` };
    }

    // Check availability of new slot
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const slots = SlotEngine.computeSlotsForCourt(court, newDate, booking.customer_phone);
    const newSlot = slots.find(s => s.start_time === newStartTime);

    if (!newSlot || newSlot.status !== 'available') {
      return {
        success: false,
        message: `Slot ${newStartTime} on ${newDate} is not available.`
      };
    }

    const oldDate = booking.booking_date;
    const oldTime = booking.start_time;

    booking.booking_date = newDate;
    booking.start_time = newStartTime;
    const durMins = court.slot_duration_minutes || 60;
    const endMins = SlotEngine.timeToMinutes(newStartTime) + durMins;
    booking.end_time = SlotEngine.minutesToTime(endMins);
    booking.updated_at = new Date().toISOString();
    booking.notes = `${booking.notes || ''} | Rescheduled from ${oldDate} ${oldTime}`;

    // Persist rescheduling to Supabase PostgreSQL database
    SupabaseService.updateBooking(booking.id, {
      booking_date: newDate,
      start_time: newStartTime,
      end_time: booking.end_time,
      notes: booking.notes,
      updated_at: booking.updated_at
    }).catch(err => console.warn('Supabase updateBooking reschedule error:', err.message));

    // Send WhatsApp Reschedule Notice
    NotificationService.sendBookingConfirmation(booking);

    return {
      success: true,
      booking,
      message: `Rescheduled successfully to ${newDate} at ${newStartTime}!`
    };
  }

  /**
   * CC-A05: Identify expired holds and trigger smart re-engagement nudge at minute 6
   */
  static checkExpiredHoldsAndNudge() {
    const now = Date.now();
    const bookings = store.getBookings();
    const nudgesSent = [];

    for (const b of bookings) {
      if (b.status === 'pending_payment' && !b.nudge_sent) {
        const createdMs = new Date(b.created_at).getTime();
        const ageMinutes = (now - createdMs) / 60000;

        // Trigger at minute 5 to 15 (1 min after hold expires)
        if (ageMinutes >= 5 && ageMinutes <= 15) {
          b.nudge_sent = true;
          const nudgeMsg = `👋 Hey ${b.customer_name || 'Captain'}! Your 5-minute reservation hold on ${b.court_name} (${b.start_time}) just expired. Would you like us to hold it for another 5 minutes, or check a different time? ⚽`;
          NotificationService.sendWhatsAppMessage(b.customer_phone, nudgeMsg);
          nudgesSent.push({ bookingRef: b.booking_ref, phone: b.customer_phone, message: nudgeMsg });
        }
      }
    }

    return nudgesSent;
  }
}
