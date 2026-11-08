// Notification Service & Dispatcher
import { store } from '../data/store.js';
import { WhatsAppService } from './whatsappService.js';
import { GatePassService } from './gatePassService.js';

export class NotificationService {
  /**
   * Log and dispatch a real WhatsApp message if client is connected
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

    // Dispatch directly to actual WhatsApp user if Baileys agent is linked
    if (WhatsAppService.isConnected()) {
      WhatsAppService.sendMessage(recipientPhone, messageText).catch(err => {
        console.warn(`⚠️ Failed to deliver live WhatsApp message to ${recipientPhone}:`, err.message);
      });
    }

    return log;
  }

  /**
   * Send WhatsApp Booking Confirmation Card & PDF Gate Pass
   */
  static sendBookingConfirmation(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const sports = store.getSports();
    const sport = sports.find(s => s.id === booking.sport_id);
    const otpCode = booking.booking_ref ? booking.booking_ref.slice(-4) : '0000';

    const message = `🎉 *BOOKING CONFIRMED — TURFFLOW ARENA* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎟️ *Booking Ref:* \`${booking.booking_ref}\`\n` +
      `🔑 *Gate Check-in OTP:* *${otpCode}*\n` +
      `🏟️ *Court:* ${court?.name || 'Main Turf'}\n` +
      `🏅 *Sport:* ${sport?.icon || '⚽'} ${sport?.name || 'Football'}\n` +
      `📅 *Date:* ${booking.booking_date}\n` +
      `⏰ *Time:* ${booking.start_time} — ${booking.end_time} (${court?.slot_duration_minutes || 60} mins)\n` +
      `💰 *Total Paid:* ₹${booking.total_amount} (via Razorpay UPI)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Venue Address:* ${venue.address}\n` +
      `🗺️ *Google Maps:* ${venue.google_maps_link}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 *Your official PDF Gate Pass & Payment Receipt is attached below!* Show the PDF or your 4-digit OTP *${otpCode}* at the gate.\n\n` +
      `⚠️ *Pitch Rules:* Turf shoes only (no metal spikes). Please arrive 10 mins early.\n\n` +
      `Need to reschedule or cancel? Just reply *"Manage booking ${booking.booking_ref}"* anytime!`;

    const log = this.sendWhatsAppMessage(booking.customer_phone, message, {
      type: 'confirmation',
      booking_ref: booking.booking_ref
    });

    // Send PDF Gate Pass & Receipt attachment directly on WhatsApp
    GatePassService.generatePassPdfBuffer(booking).then(pdfBuffer => {
      if (pdfBuffer && WhatsAppService.isConnected()) {
        WhatsAppService.sendDocument(
          booking.customer_phone,
          pdfBuffer,
          `GatePass-${booking.booking_ref}.pdf`,
          `🎟️ *VENUE ENTRY PASS & PAYMENT RECEIPT*\nRef: \`${booking.booking_ref}\` | Gate OTP: *${otpCode}*`
        ).catch(err => console.warn('PDF pass dispatch warning:', err.message));
      }
    }).catch(err => {
      console.warn('PDF generation error:', err.message);
    });

    return log;
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
