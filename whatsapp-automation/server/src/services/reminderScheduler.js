// Automated 1-Hour Reminder Scheduler for TurfFlow Backend
import { store } from '../data/store.js';
import { EmailService } from './emailService.js';
import { SmsService } from './smsService.js';
import { NotificationService } from './notificationService.js';
import { SlotEngine } from './slotEngine.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';
import { SupabaseService } from './supabaseService.js';

export class ReminderScheduler {
  static timerId = null;
  static isRunning = false;

  static checkAndDispatch() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const bookings = store.getBookings();
    let count = 0;

    // 1. Auto-complete confirmed bookings whose slot has elapsed
    for (const booking of bookings) {
      if (booking.status !== 'confirmed') continue;
      if (!booking.booking_date || !booking.end_time) continue;
      const [bY, bM, bD] = (booking.booking_date || '').split('-').map(Number);
      const [bH, bMin] = (booking.end_time || '00:00').split(':').map(Number);
      if (!bY || !bM || !bD || isNaN(bH) || isNaN(bMin)) continue;

      const slotEndTime = new Date(bY, bM - 1, bD, bH, bMin, 0);
      if (bH === 0 && bMin === 0) {
        slotEndTime.setDate(slotEndTime.getDate() + 1);
      }

      if (now.getTime() >= slotEndTime.getTime()) {
        booking.status = 'completed';
        booking.updated_at = new Date().toISOString();
        console.log(`🏁 [BACKEND AUTO-COMPLETE] Booking ${booking.booking_ref} slot ended (${booking.end_time}). Automatically marked completed.`);
        SupabaseService.updateBooking(booking.id, {
          status: 'completed',
          updated_at: booking.updated_at
        }).catch(err => {
          console.warn('[ReminderScheduler] Error updating auto-completed booking in Supabase:', err.message);
        });
      }
    }

    // 2. Dispatch 1-Hour matchday kickoff reminders
    for (const booking of bookings) {
      if (booking.status !== 'confirmed') continue;
      if (!booking.booking_date || !booking.start_time) continue;
      const [bY, bM, bD] = (booking.booking_date || '').split('-').map(Number);
      const [bH, bMin] = (booking.start_time || '00:00').split(':').map(Number);
      const bookingStartTime = new Date(bY, bM - 1, bD, bH, bMin, 0);
      const diffMins = Math.round((bookingStartTime.getTime() - now.getTime()) / (60 * 1000));

      // 1-Hour window: 45 to 75 minutes before game starts
      if (diffMins >= 45 && diffMins <= 75) {
        if (!booking.reminder_sent) {
          booking.reminder_sent = true;
          count++;

          console.log(`⏰ [BACKEND 1-HR REMINDER] Booking ${booking.booking_ref} starting in ${diffMins} mins.`);

          // 1. Dispatch Email via Resend
          EmailService.sendBookingReminder(booking).catch(err => {
            console.warn('[ReminderScheduler] Resend reminder error:', err.message);
          });

          // 2. Dispatch Matchday Kickoff SMS Reminder
          SmsService.sendBookingReminder(booking).catch(err => {
            console.warn('[ReminderScheduler] SMS reminder error:', err.message);
          });

          // 3. Dispatch WhatsApp reminder
          const venue = store.getVenue();
          const court = store.getCourts().find(c => c.id === booking.court_id);
          const otpCode = WhatsAppFormatter.getBookingGatePassOtp(booking);
          const waMessage = `⏰ *MATCHDAY REMINDER (1 HOUR TO KICKOFF)* ⏰\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Hi ${booking.customer_name || 'Player'}, your pitch reservation starts in 1 hour!\n\n` +
            `🏟️ *Court:* ${court?.name || 'Pitch'}\n` +
            `📅 *Date:* ${WhatsAppFormatter.formatDate(booking.booking_date)}\n` +
            `⏰ *Time:* ${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)}\n` +
            `🔑 *Gate Pass OTP:* *${otpCode}*\n` +
            `📍 *Address:* ${venue.address}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Please arrive 10 minutes early. Turf shoes with rubber soles only!`;

          NotificationService.sendWhatsAppMessage(booking.customer_phone, waMessage, {
            type: 'reminder',
            booking_ref: booking.booking_ref
          });
        }
      }
    }

    return count;
  }

  static start(intervalMs = 60000) {
    if (this.isRunning) return;
    this.isRunning = true;

    this.checkAndDispatch();
    this.timerId = setInterval(() => {
      this.checkAndDispatch();
    }, intervalMs);

    console.log('⏰ [ReminderScheduler] Backend 1-Hour Reminder scheduler started (polling every 60s).');
  }

  static stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
  }
}
