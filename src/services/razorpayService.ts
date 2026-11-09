import { store } from './store';
import { PostgresEngine } from './postgresEngine';
import { RedisLockService } from './redisLockService';
import { NotificationService } from './notificationService';
import { AuditLogger } from './auditLogger';
import { Payment } from '../types/schema';
import { SupabaseSyncService } from './supabaseSyncService';

export interface RazorpayOrder {
  order_id: string;
  booking_id: string;
  amount: number;
  currency: 'INR';
  status: 'created';
}

export class RazorpayService {
  /**
   * Create Razorpay payment order for booking
   */
  public static createOrder(bookingId: string, amount: number): RazorpayOrder {
    const orderId = `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const payments = store.getPayments();

    const paymentRecord: Payment = {
      id: `pay-${Date.now()}`,
      booking_id: bookingId,
      gateway: 'razorpay',
      gateway_order_id: orderId,
      amount,
      status: 'created',
      method: 'upi',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    payments.push(paymentRecord);
    store.setPayments(payments);

    // Sync payment order to Supabase
    SupabaseSyncService.syncPaymentToSupabase(paymentRecord).catch(err => {
      console.warn('❌ [RazorpayService] Error syncing payment record to Supabase:', err);
    });

    return {
      order_id: orderId,
      booking_id: bookingId,
      amount,
      currency: 'INR',
      status: 'created'
    };
  }

  /**
   * Process Razorpay Webhook Event (Source of Truth, Idempotent)
   * CC-P01: Idempotency protection via gateway_payment_id
   * CC-P02: Late payment capture on expired lock with taken slot (automatic conflict detection & 100% refund)
   */
  public static processWebhook(payload: {
    event: 'payment.captured' | 'payment.failed';
    payment_id: string;
    order_id: string;
    method: 'upi' | 'card' | 'netbanking';
    signature: string;
  }): { success: boolean; message: string; conflictRefunded?: boolean } {
    const payments = store.getPayments();
    const payment = payments.find(p => p.gateway_order_id === payload.order_id);

    if (!payment) {
      return { success: false, message: 'Payment record not found for order' };
    }

    // CC-P01: Idempotency check: if payment already captured with this payment_id, return success without re-processing
    if (payment.status === 'captured' && payment.gateway_payment_id === payload.payment_id) {
      return { success: true, message: 'Webhook already processed (Idempotent replay)' };
    }

    const bookings = store.getBookings();
    const booking = bookings.find(b => b.id === payment.booking_id);

    if (!booking) {
      return { success: false, message: 'Booking reference not found' };
    }

    if (payload.event === 'payment.captured') {
      // 1. Update Payment status
      payment.status = 'captured';
      payment.gateway_payment_id = payload.payment_id;
      payment.method = payload.method;
      payment.raw_webhook_payload = payload;
      payment.updated_at = new Date().toISOString();

      // CC-P02: Late Payment Capture Conflict Detection
      // Check if another booking on the same court and date took this slot interval while the lock expired
      const conflictingBooking = bookings.find(b => 
        b.id !== booking.id &&
        b.court_id === booking.court_id &&
        b.booking_date === booking.booking_date &&
        (b.status === 'confirmed' || b.status === 'pending_payment') &&
        PostgresEngine.isTimeOverlap(booking.start_time, booking.end_time, b.start_time, b.end_time)
      );

      if (conflictingBooking) {
        // Slot was taken by someone else! Issue 100% automatic conflict refund
        payment.status = 'refunded';
        store.setPayments(payments);
        SupabaseSyncService.syncPaymentToSupabase(payment).catch(err => {
          console.warn('❌ [RazorpayService] Error syncing refunded payment to Supabase:', err);
        });

        PostgresEngine.updateBookingStatus(booking.id, 'refunded', {
          refundAmount: booking.total_amount,
          refundReason: `Automatic conflict refund: late payment captured after hold expired; slot was reserved by ${conflictingBooking.booking_ref}`,
          cancelledBy: 'admin',
          metTerms: true
        });

        AuditLogger.log(
          'SYSTEM',
          'LATE_PAYMENT_SLOT_CONFLICT_REFUND',
          'Booking',
          booking.id,
          { booking_ref: booking.booking_ref, payment_id: payload.payment_id, slot: `${booking.start_time} - ${booking.end_time}` },
          { conflicting_booking_ref: conflictingBooking.booking_ref, refund_amount: booking.total_amount }
        );

        return {
          success: false,
          conflictRefunded: true,
          message: `Late payment captured after hold expired. Slot was already booked by another player. 100% instant refund (₹${booking.total_amount}) initiated automatically.`
        };
      }

      // 2. Confirm Booking via PostgresEngine state machine
      PostgresEngine.updateBookingStatus(booking.id, 'confirmed');

      // 3. Release Redis Locks for all slots in booking span
      RedisLockService.releaseLocksForBooking(booking.court_id, booking.booking_date, booking.start_time, booking.end_time);

      // 4. Trigger Outbound WhatsApp / SMS Confirmation Notification Job
      NotificationService.enqueueNotification(booking, 'confirmation');

      store.setPayments(payments);
      SupabaseSyncService.syncPaymentToSupabase(payment).catch(err => {
        console.warn('❌ [RazorpayService] Error syncing captured payment to Supabase:', err);
      });

      return {
        success: true,
        message: `Payment ${payload.payment_id} captured. Booking ${booking.booking_ref} confirmed!`
      };
    } else {
      // Payment Failed
      payment.status = 'failed';
      payment.raw_webhook_payload = payload;
      payment.updated_at = new Date().toISOString();

      // Cancel pending booking
      PostgresEngine.updateBookingStatus(booking.id, 'cancelled');

      // Release Lock
      RedisLockService.releaseLock(booking.court_id, booking.booking_date, booking.start_time);

      store.setPayments(payments);
      SupabaseSyncService.syncPaymentToSupabase(payment).catch(err => {
        console.warn('❌ [RazorpayService] Error syncing failed payment to Supabase:', err);
      });

      return {
        success: false,
        message: `Payment failed for order ${payload.order_id}. Booking cancelled.`
      };
    }
  }
}
