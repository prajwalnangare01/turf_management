import { store } from './store';
import { Booking, BookingStatus } from '../types/schema';
import { RedisLockService } from './redisLockService';
import { AuditLogger } from './auditLogger';
import { NotificationService } from './notificationService';
import { SupabaseSyncService } from './supabaseSyncService';

export class PostgresEngine {
  /**
   * Helper to convert HH:mm string to minutes from midnight
   */
  private static timeToMinutes(timeStr: string): number {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Valid booking status state transitions
   */
  private static VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
    pending_payment: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled', 'no_show', 'refunded'],
    completed: ['refunded'],
    cancelled: ['refunded'],
    refunded: ['refunded'],
    no_show: ['refunded']
  };

  /**
   * Check if two time intervals [s1, e1) and [s2, e2) overlap
   */
  public static isTimeOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
    const start1 = this.timeToMinutes(s1);
    const end1 = this.timeToMinutes(e1);
    const start2 = this.timeToMinutes(s2);
    const end2 = this.timeToMinutes(e2);
    return start1 < end2 && end1 > start2;
  }

  /**
   * Update customer stats when a booking state changes
   */
  private static syncCustomerStats(customerId: string, statusDelta: BookingStatus, amount: number) {
    const customers = store.getCustomers();
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    if (statusDelta === 'confirmed') {
      customer.total_bookings = (customer.total_bookings || 0) + 1;
      customer.total_spent = (customer.total_spent || 0) + amount;
    } else if (statusDelta === 'no_show') {
      customer.no_show_count = (customer.no_show_count || 0) + 1;
      // Auto-blacklist customer if no_show count reaches 3 or more
      if (customer.no_show_count >= 3 && !customer.is_blacklisted) {
        customer.is_blacklisted = true;
        AuditLogger.log('SYSTEM', 'AUTO_BLACKLIST_NO_SHOW_THRESHOLD', 'Customer', customer.id, { no_show_count: customer.no_show_count });
      }
    } else if (statusDelta === 'refunded') {
      customer.total_spent = Math.max(0, (customer.total_spent || 0) - amount);
    }

    store.setCustomers(customers);
  }

  /**
   * Attempt to insert a booking while enforcing DB unique interval constraint:
   * UNIQUE (court_id, booking_date, time_interval) WHERE status IN ('pending_payment', 'confirmed')
   */
  public static createBooking(booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>): { success: boolean; message: string; booking?: Booking } {
    const bookings = store.getBookings();

    // Check unique index constraint against overlapping active bookings
    if (booking.status === 'pending_payment' || booking.status === 'confirmed') {
      const activeConflict = bookings.find(b => 
        b.court_id === booking.court_id &&
        b.booking_date === booking.booking_date &&
        (b.status === 'pending_payment' || b.status === 'confirmed') &&
        this.isTimeOverlap(booking.start_time, booking.end_time, b.start_time, b.end_time)
      );

      if (activeConflict) {
        return {
          success: false,
          message: `[Postgres Unique Constraint Violation] Slot interval ${booking.start_time} - ${booking.end_time} on ${booking.booking_date} conflicts with active booking ${activeConflict.booking_ref} (${activeConflict.start_time} - ${activeConflict.end_time}).`
        };
      }
    }

    const now = new Date().toISOString();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newBooking: Booking = {
      ...booking,
      id: `bk-${Date.now()}-${randomSuffix}`,
      booking_ref: booking.booking_ref || `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomSuffix}`,
      created_at: now,
      updated_at: now
    };

    bookings.push(newBooking);
    store.setBookings(bookings);

    if (newBooking.status === 'confirmed') {
      this.syncCustomerStats(newBooking.customer_id, 'confirmed', newBooking.total_amount);
    }

    return {
      success: true,
      message: 'Booking inserted successfully into database',
      booking: newBooking
    };
  }

  /**
   * Update booking status with state machine verification and refund tracking
   */
  public static updateBookingStatus(
    bookingId: string, 
    newStatus: BookingStatus,
    refundDetails?: { 
      refundAmount?: number; 
      refundReason?: string; 
      adminId?: string;
      cancelledBy?: 'customer' | 'admin';
      noticeHours?: number;
      metTerms?: boolean;
    }
  ): { success: boolean; message: string; booking?: Booking } {
    const bookings = store.getBookings();
    const booking = bookings.find(b => b.id === bookingId);

    if (!booking) {
      return { success: false, message: 'Booking not found' };
    }

    const allowedNext = this.VALID_TRANSITIONS[booking.status];
    if (!allowedNext.includes(newStatus)) {
      return {
        success: false,
        message: `[Illegal State Transition] Cannot change booking status from '${booking.status}' to '${newStatus}'.`
      };
    }

    const oldStatus = booking.status;
    const priorRefundAmount = booking.refund_amount || 0;
    booking.status = newStatus;
    booking.updated_at = new Date().toISOString();

    if (newStatus === 'cancelled' || newStatus === 'refunded') {
      booking.cancelled_by = refundDetails?.cancelledBy || (refundDetails?.adminId ? 'admin' : 'customer');
      booking.cancelled_at = new Date().toISOString();
      if (refundDetails?.noticeHours !== undefined) {
        booking.cancellation_notice_hours = refundDetails.noticeHours;
      }
      if (refundDetails?.metTerms !== undefined) {
        booking.cancellation_met_terms = refundDetails.metTerms;
      }
      if (refundDetails?.refundReason) {
        booking.refund_reason = refundDetails.refundReason;
      }
    }

    if (newStatus === 'refunded' && refundDetails) {
      booking.refund_amount = refundDetails.refundAmount ?? 0;
      booking.refunded_at = new Date().toISOString();

      // Record refund on payment record
      const payments = store.getPayments();
      const payRecord = payments.find(p => p.booking_id === booking.id);
      if (payRecord) {
        payRecord.status = 'refunded';
        payRecord.updated_at = new Date().toISOString();
        store.setPayments(payments);
      }
    } else if (newStatus === 'cancelled') {
      booking.refund_amount = 0;
    }

    store.setBookings(bookings);

    // Sync metrics for customer (using actual refund amount if present)
    if (newStatus === 'refunded') {
      const effectiveRefundDelta = oldStatus === 'refunded'
        ? Math.max(0, (booking.refund_amount || 0) - priorRefundAmount)
        : (booking.refund_amount !== undefined ? booking.refund_amount : booking.total_amount);
      this.syncCustomerStats(booking.customer_id, newStatus, effectiveRefundDelta);
    } else {
      this.syncCustomerStats(booking.customer_id, newStatus, booking.total_amount);
    }

    // If booking cancelled or refunded, release any corresponding Redis locks & trigger notification
    if (newStatus === 'cancelled' || newStatus === 'refunded') {
      RedisLockService.releaseLocksForBooking(booking.court_id, booking.booking_date, booking.start_time, booking.end_time);
      NotificationService.enqueueNotification(booking, 'cancellation');
    }

    return {
      success: true,
      message: `Booking ${booking.booking_ref} status updated from ${oldStatus} to ${newStatus}`,
      booking
    };
  }
}
