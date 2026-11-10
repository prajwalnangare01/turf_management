import { store } from './store';
import { Booking, NotificationLog } from '../types/schema';
import { EmailService } from './emailService';
import { SmsService } from './smsService';
import { formatDateDDMMYYYY, formatTime12hPlain } from '../utils/formatters';

export class NotificationService {
  public static enqueueNotification(
    booking: Booking, 
    type: NotificationLog['type'], 
    forceChannel?: 'whatsapp' | 'sms' | 'email'
  ) {
    const venue = store.getVenue();
    const customer = store.getCustomers().find(c => c.id === booking.customer_id);
    const recipientPhone = customer?.phone || '9876543210';
    const recipientEmail = customer?.email || '';
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const courtName = court?.name || 'Pitch';

    let primaryChannel: 'whatsapp' | 'sms' | 'email' = forceChannel || (venue.whatsapp_enabled ? 'whatsapp' : 'sms');
    
    const formattedDate = formatDateDDMMYYYY(booking.booking_date);
    const start12 = formatTime12hPlain(booking.start_time);
    const end12 = formatTime12hPlain(booking.end_time);

    let message = '';
    if (type === 'confirmation') {
      const otp = booking.gate_pass_otp || (booking.booking_ref || booking.id || '').slice(-4);
      message = `✅ Payment Confirmed! Venue: ${venue.name}. Court: ${courtName}. Date: ${formattedDate} @ ${start12} - ${end12}. Amount Paid: ₹${booking.total_amount}. Gate Entry OTP: ${otp}. See you on the turf!`;
    } else if (type === 'reminder') {
      const otp = (booking.booking_ref || booking.id || '').slice(-4);
      message = `⏰ Reminder: Your game at ${venue.name} starts in 1 hour (${start12})! Court: ${courtName}. Gate Entry OTP: ${otp}. Please arrive 10 mins early with turf shoes.`;
    } else if (type === 'cancellation') {
      if (booking.refund_amount && booking.refund_amount > 0) {
        message = `❌ Booking Cancelled: Ref ${booking.booking_ref} (${formattedDate} @ ${start12}). A refund of ₹${booking.refund_amount} has been initiated to your original payment method.`;
      } else {
        message = `❌ Booking Cancelled: Ref ${booking.booking_ref} for ${formattedDate} @ ${start12}. Per venue cancellation window policy, no refund is due.`;
      }
    }

    const logs = store.getNotificationLogs();

    // 1. Log primary SMS / WhatsApp message
    const primaryLog: NotificationLog = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      booking_id: booking.id,
      channel: primaryChannel,
      type,
      status: 'delivered',
      recipient: primaryChannel === 'email' ? (recipientEmail || recipientPhone) : recipientPhone,
      message_preview: message,
      retry_count: 0,
      sent_at: new Date().toISOString()
    };

    logs.unshift(primaryLog);

    // 2. Dispatch Resend Email if recipient has email and email is enabled (and primary was not already email)
    const isEmailEnabled = venue.email_enabled !== false;
    if (recipientEmail && isEmailEnabled && primaryChannel !== 'email' && customer) {
      const emailSubject = type === 'confirmation'
        ? `Booking Confirmed: ${booking.booking_ref} - ${venue.name}`
        : type === 'reminder'
          ? `⏰ Kickoff in 1 Hour: ${courtName} at ${formatTime12hPlain(booking.start_time)} (${venue.name})`
          : type === 'cancellation'
            ? (booking.refund_amount && booking.refund_amount > 0
                ? `Booking Cancelled & Refund Initiated: ${booking.booking_ref}`
                : `Booking Cancelled: ${booking.booking_ref}`)
            : `TurfFlow Notification - ${booking.booking_ref}`;

      const emailLog: NotificationLog = {
        id: `notif-email-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        booking_id: booking.id,
        channel: 'email',
        type,
        status: 'delivered',
        recipient: recipientEmail,
        message_preview: `[Resend] ${emailSubject}`,
        retry_count: 0,
        sent_at: new Date().toISOString()
      };

      logs.unshift(emailLog);

      // Async trigger Resend dispatch
      if (type === 'confirmation') {
        EmailService.sendBookingConfirmation({
          booking,
          customer,
          courtName,
          venue
        }).catch(err => console.warn('[NotificationService] Email confirmation dispatch failed:', err));
      } else if (type === 'reminder') {
        EmailService.sendBookingReminder({
          booking,
          customer,
          courtName,
          venue
        }).catch(err => console.warn('[NotificationService] Email reminder dispatch failed:', err));
      } else if (type === 'cancellation') {
        EmailService.sendBookingCancellation({
          booking,
          customer,
          courtName,
          venue,
          refundAmount: booking.refund_amount || 0,
          refundPercentage: booking.cancellation_met_terms ? 100 : 0,
          metTerms: booking.cancellation_met_terms,
          noticeHours: booking.cancellation_notice_hours
        }).catch(err => console.warn('[NotificationService] Email cancellation dispatch failed:', err));
      }
    }

    // 3. Dispatch SMS notification for Confirmation & Kickoff Reminder
    if (venue.sms_fallback_enabled !== false) {
      if (type === 'confirmation') {
        SmsService.sendBookingConfirmation({
          booking,
          customer,
          courtName,
          venue
        }).catch(err => console.warn('[NotificationService] SMS confirmation dispatch failed:', err));
      } else if (type === 'reminder') {
        SmsService.sendBookingReminder({
          booking,
          customer,
          courtName,
          venue
        }).catch(err => console.warn('[NotificationService] SMS reminder dispatch failed:', err));
      }
    }

    if (type === 'reminder') {
      booking.reminder_sent = true;
      const allBookings = store.getBookings();
      const bIdx = allBookings.findIndex(b => b.id === booking.id);
      if (bIdx !== -1) {
        allBookings[bIdx].reminder_sent = true;
        store.setBookings(allBookings);
      }
    }

    store.setNotificationLogs(logs);
    return primaryLog;
  }
}
