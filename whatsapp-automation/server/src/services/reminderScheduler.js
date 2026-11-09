// Automated 1-Hour Reminder Scheduler for TurfFlow Backend
import { store } from '../data/store.js';
import { EmailService } from './emailService.js';
import { SmsService } from './smsService.js';
import { NotificationService } from './notificationService.js';
import { SlotEngine } from './slotEngine.js';

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

    for (const booking of bookings) {
      if (booking.status !== 'confirmed') continue;
      if (booking.booking_date !== todayStr) continue;

      const startMins = SlotEngine.timeToMinutes(booking.start_time);
      const diffMins = startMins - currentMins;

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
          const otpCode = booking.booking_ref ? booking.booking_ref.slice(-4) : '0000';
          const waMessage = `⏰ *MATCHDAY REMINDER (1 HOUR TO KICKOFF)* ⏰\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Hi ${booking.customer_name || 'Player'}, your pitch reservation starts in 1 hour!\n\n` +
            `🏟️ *Court:* ${court?.name || 'Pitch'}\n` +
            `⏰ *Time:* ${booking.start_time} — ${booking.end_time}\n` +
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
