import { store } from './store';
import { Booking, NotificationLog } from '../types/schema';

export class NotificationService {
  public static enqueueNotification(
    booking: Booking, 
    type: NotificationLog['type'], 
    forceChannel?: 'whatsapp' | 'sms'
  ) {
    const venue = store.getVenue();
    const customer = store.getCustomers().find(c => c.id === booking.customer_id);
    const recipientPhone = customer?.phone || '9876543210';
    const court = store.getCourts().find(c => c.id === booking.court_id);

    let channel: 'whatsapp' | 'sms' = forceChannel || (venue.whatsapp_enabled ? 'whatsapp' : 'sms');
    
    let message = '';
    if (type === 'confirmation') {
      message = `🎉 Booking Confirmed! Ref: ${booking.booking_ref}. Venue: ${venue.name}. Court: ${court?.name}. Date: ${booking.booking_date} @ ${booking.start_time} - ${booking.end_time}. Amount: ₹${booking.total_amount}. See you on the turf!`;
    } else if (type === 'reminder') {
      message = `⏰ Reminder: Your game at ${venue.name} starts in 2 hours (${booking.start_time}). Court: ${court?.name}. Have a great match!`;
    } else if (type === 'cancellation') {
      message = `❌ Booking Cancelled: Ref ${booking.booking_ref} for ${booking.booking_date} @ ${booking.start_time}. Any refund due will be processed per venue policy.`;
    }

    const log: NotificationLog = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      booking_id: booking.id,
      channel,
      type,
      status: 'delivered',
      recipient: recipientPhone,
      message_preview: message,
      retry_count: 0,
      sent_at: new Date().toISOString()
    };

    const logs = store.getNotificationLogs();
    logs.unshift(log);
    store.setNotificationLogs(logs);

    return log;
  }
}
