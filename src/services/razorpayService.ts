import { store } from './store';
import { PostgresEngine } from './postgresEngine';
import { RedisLockService } from './redisLockService';
import { NotificationService } from './notificationService';
import { Payment } from '../types/schema';

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
   */
  public static processWebhook(payload: {
    event: 'payment.captured' | 'payment.failed';
    payment_id: string;
    order_id: string;
    method: 'upi' | 'card' | 'netbanking';
    signature: string;
  }): { success: boolean; message: string } {
    const payments = store.getPayments();
    const payment = payments.find(p => p.gateway_order_id === payload.order_id);

    if (!payment) {
      return { success: false, message: 'Payment record not found for order' };
    }

    // Idempotency check: if payment already captured, return success without re-processing
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

      // 2. Confirm Booking via PostgresEngine state machine
      PostgresEngine.updateBookingStatus(booking.id, 'confirmed');

      // 3. Release Redis Locks for all slots in booking span
      RedisLockService.releaseLocksForBooking(booking.court_id, booking.booking_date, booking.start_time, booking.end_time);

      // 4. Trigger Outbound WhatsApp / SMS Confirmation Notification Job
      NotificationService.enqueueNotification(booking, 'confirmation');

      store.setPayments(payments);

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

      return {
        success: false,
        message: `Payment failed for order ${payload.order_id}. Booking cancelled.`
      };
    }
  }
}
