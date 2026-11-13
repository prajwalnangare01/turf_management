import { store } from './store';
import { Booking, NotificationLog } from '../types/schema';
import { EmailService } from './emailService';
import { SmsService } from './smsService';
import { formatDateDDMMYYYY, formatTime12hPlain, getBookingGatePassOtp } from '../utils/formatters';

export class NotificationService {
  public static enqueueNotification(
    booking: Booking, 
    type: NotificationLog['type'], 
    forceChannel?: 'whatsapp' | 'sms' | 'email'
  ) {
    const venue = store.getVenue();
    let customer = store.getCustomers().find(c => c.id === booking.customer_id);
    if (!customer && booking.customer_phone) {
      customer = store.getCustomers().find(c => c.phone === booking.customer_phone);
    }
    const recipientPhone = customer?.phone || booking.customer_phone || '9876543210';
    const recipientEmail = customer?.email || (booking as any).customer_email || '';
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const courtName = court?.name || 'Pitch';

    let primaryChannel: 'whatsapp' | 'sms' | 'email' = forceChannel || (venue.whatsapp_enabled ? 'whatsapp' : 'sms');
    
    const formattedDate = formatDateDDMMYYYY(booking.booking_date);
    const start12 = formatTime12hPlain(booking.start_time);
    const end12 = formatTime12hPlain(booking.end_time);

    let message = '';
    if (type === 'confirmation') {
      const otp = getBookingGatePassOtp(booking);
      const slotTimesText = booking.formatted_slots || `${start12} - ${end12}`;
      const totalAmount = booking.total_order_amount || booking.total_amount;
      message = `✅ Payment Confirmed! Venue: ${venue.name}. Court: ${courtName}. Date: ${formattedDate}. Slot(s): ${slotTimesText}. Amount Paid: ₹${totalAmount}. Gate Entry OTP: ${otp}. See you on the turf!`;
    } else if (type === 'reminder') {
      const otp = getBookingGatePassOtp(booking);
      message = `⏰ Reminder: Your game at ${venue.name} starts in 1 hour (${start12})! Date: ${formattedDate}. Court: ${courtName}. Gate Entry OTP: ${otp}. Please arrive 10 mins early with turf shoes.`;
    } else if (type === 'cancellation') {
      const isRainout = 
        booking.refund_reason?.toLowerCase().includes('rain') ||
        booking.refund_reason?.toLowerCase().includes('weather') ||
        booking.refund_reason?.includes('Emergency Rainout');

      if (isRainout) {
        message = `🌧️ Match Cancelled by Turf Management due to Rain: Ref ${booking.booking_ref} (${formattedDate} @ ${start12}). A 100% full refund of ₹${booking.refund_amount || booking.total_amount} has been initiated back to your original payment method. We apologize for the pitch conditions and thank you for your understanding!`;
      } else if (booking.cancelled_by === 'admin') {
        message = `❌ Booking Cancelled by Venue Management: Ref ${booking.booking_ref} (${formattedDate} @ ${start12}). ${booking.refund_amount && booking.refund_amount > 0 ? `A refund of ₹${booking.refund_amount} has been initiated.` : `For assistance, contact ${venue.contact_phone}.`}`;
      } else if (booking.refund_amount && booking.refund_amount > 0) {
        message = `❌ Booking Cancelled: Ref ${booking.booking_ref} (${formattedDate} @ ${start12}). A refund of ₹${booking.refund_amount} has been initiated to your original payment method.`;
      } else {
        message = `❌ Booking Cancelled: Ref ${booking.booking_ref} for ${formattedDate} @ ${start12}. Per venue cancellation window policy, no refund is due.`;
      }
    } else if (type === 'refund') {
      const refundAmt = booking.refund_amount !== undefined ? booking.refund_amount : booking.total_amount;
      message = `💳 Refund Initiated: ₹${refundAmt} for booking ref ${booking.booking_ref} (${courtName} on ${formattedDate}). Amount will reflect in your original payment method within 5-7 business days.`;
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

    // 2. Dispatch Email if recipient has email and email is enabled
    const isWhatsAppBooking = (booking.source as string) === 'whatsapp' || booking.source === 'offline_whatsapp'; const isEmailEnabled = venue.email_enabled !== false;
    if (!isWhatsAppBooking && recipientEmail && isEmailEnabled && (customer || (booking as any).customer_email)) {
      const effectiveCustomer = customer || {
        id: booking.customer_id,
        name: booking.customer_name || 'Player',
        phone: recipientPhone,
        email: recipientEmail,
        created_at: new Date().toISOString(),
        total_bookings: 1,
        total_spent: booking.total_amount,
        no_show_count: 0,
        is_blacklisted: false
      };

      const refundAmt = booking.refund_amount !== undefined ? booking.refund_amount : booking.total_amount;
      const emailSubject = type === 'confirmation'
        ? `Booking Confirmed: ${booking.booking_ref} - ${venue.name}`
        : type === 'reminder'
          ? `⏰ Kickoff in 1 Hour: ${courtName} at ${formatTime12hPlain(booking.start_time)} (${venue.name})`
          : type === 'cancellation'
            ? ((booking.refund_reason?.toLowerCase().includes('rain') || booking.refund_reason?.includes('Emergency Rainout'))
                ? `🌧️ Match Cancelled by Venue due to Rain: ${booking.booking_ref}`
                : (booking.cancelled_by === 'admin'
                    ? `❌ Booking Cancelled by Venue Management: ${booking.booking_ref}`
                    : `❌ Booking Cancelled: ${booking.booking_ref}`))
            : type === 'refund'
              ? `💳 Refund Initiated: ₹${refundAmt} for Booking ${booking.booking_ref} — ${venue.name}`
              : `TurfFlow Notification - ${booking.booking_ref}`;

      if (primaryChannel !== 'email') {
        const emailLog: NotificationLog = {
          id: `notif-email-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          booking_id: booking.id,
          channel: 'email',
          type,
          status: 'delivered',
          recipient: recipientEmail,
          message_preview: `[Email] ${emailSubject}`,
          retry_count: 0,
          sent_at: new Date().toISOString()
        };

        logs.unshift(emailLog);
      }

      // Async trigger Email dispatch
      if (type === 'confirmation') {
        EmailService.sendBookingConfirmation({
          booking,
          customer: effectiveCustomer,
          courtName,
          venue
        }).catch(err => console.warn('[NotificationService] Email confirmation dispatch failed:', err));
      } else if (type === 'reminder') {
        EmailService.sendBookingReminder({
          booking,
          customer: effectiveCustomer,
          courtName,
          venue
        }).catch(err => console.warn('[NotificationService] Email reminder dispatch failed:', err));
      } else if (type === 'cancellation') {
        EmailService.sendBookingCancellation({
          booking,
          customer: effectiveCustomer,
          courtName,
          venue,
          refundAmount: booking.refund_amount || 0,
          refundPercentage: booking.cancellation_met_terms ? 100 : 0,
          metTerms: booking.cancellation_met_terms,
          noticeHours: booking.cancellation_notice_hours
        }).catch(err => console.warn('[NotificationService] Email cancellation dispatch failed:', err));
      } else if (type === 'refund') {
        EmailService.sendRefundConfirmation({
          booking,
          customer: effectiveCustomer,
          courtName,
          venue,
          refundAmount: refundAmt,
          refundReason: booking.refund_reason,
          refundMode: 'Original Payment Method (Razorpay)'
        }).catch(err => console.warn('[NotificationService] Email refund dispatch failed:', err));
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
