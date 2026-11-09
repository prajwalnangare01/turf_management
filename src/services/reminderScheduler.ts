import { store } from './store';
import { NotificationService } from './notificationService';
import { Booking } from '../types/schema';

export class ReminderScheduler {
  private static timerId: any = null;
  private static isRunning = false;

  /**
   * Helper to convert "HH:mm" to minutes since midnight
   */
  private static timeToMinutes(timeStr: string): number {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Check all bookings for today and dispatch 1-hour reminders
   */
  public static checkAndDispatch(): { dispatchedCount: number; checkedBookings: string[] } {
    const now = new Date();
    const bookings = store.getBookings();
    const notificationLogs = store.getNotificationLogs();
    let dispatchedCount = 0;
    const dispatchedRefs: string[] = [];

    for (const booking of bookings) {
      if (booking.status !== 'confirmed') continue;

      const [bY, bM, bD] = booking.booking_date.split('-').map(Number);
      const [bH, bMin] = booking.start_time.split(':').map(Number);
      const bookingStartTime = new Date(bY, bM - 1, bD, bH, bMin, 0);
      const diffMins = Math.round((bookingStartTime.getTime() - now.getTime()) / (60 * 1000));

      // 1-hour window: 45 to 75 minutes before game start
      if (diffMins >= 45 && diffMins <= 75) {
        // Check if reminder was already sent
        const alreadySent = booking.reminder_sent || notificationLogs.some(
          log => log.booking_id === booking.id && log.type === 'reminder'
        );

        if (!alreadySent) {
          booking.reminder_sent = true;
          NotificationService.enqueueNotification(booking, 'reminder');
          dispatchedCount++;
          dispatchedRefs.push(booking.booking_ref);
          console.info(`[ReminderScheduler] ⏰ Dispatched 1-hour matchday reminder for booking ${booking.booking_ref} (starts in ${diffMins} mins)`);
        }
      }
    }

    if (dispatchedCount > 0) {
      store.setBookings([...bookings]);
    }

    return { dispatchedCount, checkedBookings: dispatchedRefs };
  }

  /**
   * Manually trigger a 1-hour reminder email for a specific booking (e.g. for testing)
   */
  public static triggerManualReminder(bookingIdOrRef: string): { success: boolean; message: string } {
    const bookings = store.getBookings();
    const booking = bookings.find(b => b.id === bookingIdOrRef || b.booking_ref === bookingIdOrRef);

    if (!booking) {
      return { success: false, message: 'Booking not found' };
    }

    booking.reminder_sent = true;
    NotificationService.enqueueNotification(booking, 'reminder');
    store.setBookings([...bookings]);

    const customer = store.getCustomers().find(c => c.id === booking.customer_id);
    const target = customer?.email || customer?.phone || 'customer';

    return {
      success: true,
      message: `1-Hour reminder successfully dispatched via Email & SMS to ${target}!`
    };
  }

  /**
   * Start recurring background timer (every 60 seconds)
   */
  public static start(intervalMs = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run first check immediately
    this.checkAndDispatch();

    this.timerId = setInterval(() => {
      this.checkAndDispatch();
    }, intervalMs);

    console.info('[ReminderScheduler] Started automated 1-hour reminder scheduler.');
  }

  /**
   * Stop recurring timer
   */
  public static stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
  }
}
