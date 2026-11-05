// Notification Service & Dispatcher
import { store } from '../data/store.js';

export class NotificationService {
  /**
   * Log and simulate dispatching a WhatsApp message
   */
  static sendWhatsAppMessage(recipientPhone, messageText, templateData = null) {
    const log = {
      id: `notif-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      channel: 'whatsapp',
      recipient: recipientPhone,
      message_preview: messageText,
      template_data: templateData,
      status: 'delivered',
      sent_at: new Date().toISOString()
    };

    store.notifications.unshift(log);
    console.log(`\n📱 [WHATSAPP OUTBOUND to ${recipientPhone}]:\n${messageText}\n`);
    return log;
  }

  /**
   * Send WhatsApp Booking Confirmation Card
   */
  static sendBookingConfirmation(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const sports = store.getSports();
    const sport = sports.find(s => s.id === booking.sport_id);

    const message = `🎉 *BOOKING CONFIRMED — TURFFLOW ARENA* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎟️ *Booking Ref:* \`${booking.booking_ref}\`\n` +
      `🏟️ *Court:* ${court?.name || 'Main Turf'}\n` +
      `🏅 *Sport:* ${sport?.icon || '⚽'} ${sport?.name || 'Football'}\n` +
      `📅 *Date:* ${booking.booking_date}\n` +
      `⏰ *Time:* ${booking.start_time} — ${booking.end_time} (${court?.slot_duration_minutes || 60} mins)\n` +
      `💰 *Total Paid:* ₹${booking.total_amount} (via Razorpay UPI)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Venue Address:* ${venue.address}\n` +
      `🗺️ *Google Maps:* ${venue.google_maps_link}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ *Pitch Rules:* Turf shoes only (no metal spikes). Please arrive 10 mins early.\n\n` +
      `Need to reschedule or cancel? Just reply *"Manage booking ${booking.booking_ref}"* anytime!`;

    return this.sendWhatsAppMessage(booking.customer_phone, message, {
      type: 'confirmation',
      booking_ref: booking.booking_ref
    });
  }

  /**
   * Send Cancellation Notice
   */
  static sendCancellationNotice(booking, refundAmount, refundPct) {
    const venue = store.getVenue();
    const refundInfo = refundAmount > 0
      ? `💸 *Refund Initiated:* ₹${refundAmount} (${refundPct}% as per policy). It will reflect in your UPI account in 2-4 hours.`
      : `ℹ️ *Refund:* ₹0 (Cancelled under 6 hours notice window).`;

    const message = `❌ *BOOKING CANCELLED*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎟️ *Ref:* \`${booking.booking_ref}\`\n` +
      `📅 *Original Date:* ${booking.booking_date} @ ${booking.start_time}\n` +
      `${refundInfo}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Hope to see you back on the field soon! Message us anytime to book another slot.`;

    return this.sendWhatsAppMessage(booking.customer_phone, message, {
      type: 'cancellation',
      booking_ref: booking.booking_ref,
      refund_amount: refundAmount
    });
  }

  /**
   * Send Match Day Reminder (Outbound Scheduled Automation)
   */
  static sendMatchReminder(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);

    const message = `⏰ *MATCH REMINDER — In 2 Hours!* ⏰\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Hey ${booking.customer_name}! Your game starts soon.\n` +
      `🏟️ *Court:* ${court?.name}\n` +
      `⏰ *Kick-off:* ${booking.start_time} today (${booking.booking_date})\n` +
      `📍 *Location:* ${venue.address}\n` +
      `🗺️ *Navigate:* ${venue.google_maps_link}\n\n` +
      `Water and bibs are ready at the turf dugout. Have a great match! ⚽🔥`;

    return this.sendWhatsAppMessage(booking.customer_phone, message, {
      type: 'reminder',
      booking_ref: booking.booking_ref
    });
  }
}
