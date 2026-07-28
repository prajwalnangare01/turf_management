import { store } from './store';
import { Booking, BookingStatus } from '../types/schema';

export class PostgresEngine {
  /**
   * Valid booking status state transitions
   */
  private static VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
    pending_payment: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled', 'no_show', 'refunded'],
    completed: [], // Terminal
    cancelled: ['refunded'],
    refunded: [],  // Terminal
    no_show: []    // Terminal
  };

  /**
   * Attempt to insert a booking while enforcing DB unique index constraint:
   * UNIQUE (court_id, booking_date, start_time) WHERE status IN ('pending_payment', 'confirmed')
   */
  public static createBooking(booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>): { success: boolean; message: string; booking?: Booking } {
    const bookings = store.getBookings();

    // Check unique index constraint
    if (booking.status === 'pending_payment' || booking.status === 'confirmed') {
      const activeConflict = bookings.find(b => 
        b.court_id === booking.court_id &&
        b.booking_date === booking.booking_date &&
        b.start_time === booking.start_time &&
        (b.status === 'pending_payment' || b.status === 'confirmed')
      );

      if (activeConflict) {
        return {
          success: false,
          message: `[Postgres Unique Constraint Violation] Slot ${booking.start_time} on ${booking.booking_date} is already assigned to active booking ${activeConflict.booking_ref}.`
        };
      }
    }

    const now = new Date().toISOString();
    const newBooking: Booking = {
      ...booking,
      id: `bk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_at: now,
      updated_at: now
    };

    bookings.push(newBooking);
    store.setBookings(bookings);

    return {
      success: true,
      message: 'Booking inserted successfully into database',
      booking: newBooking
    };
  }

  /**
   * Update booking status with state machine verification
   */
  public static updateBookingStatus(bookingId: string, newStatus: BookingStatus): { success: boolean; message: string; booking?: Booking } {
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

    booking.status = newStatus;
    booking.updated_at = new Date().toISOString();
    store.setBookings(bookings);

    return {
      success: true,
      message: `Booking ${booking.booking_ref} status updated to ${newStatus}`,
      booking
    };
  }
}
