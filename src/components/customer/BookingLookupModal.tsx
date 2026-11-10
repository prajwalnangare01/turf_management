import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Booking, Customer } from '../../types/schema';
import { CancelBookingConfirmModal } from './CancelBookingConfirmModal';
import { Calendar, XCircle, AlertCircle, X, ShieldCheck, Tag, RotateCcw } from 'lucide-react';
import { formatDateDDMMYYYY, formatTimeRange12h } from '../../utils/formatters';

interface BookingLookupModalProps {
  currentCustomer: Customer;
  onClose: () => void;
}

export const BookingLookupModal: React.FC<BookingLookupModalProps> = ({ currentCustomer, onClose }) => {
  const [userBookings, setUserBookings] = useState<Booking[]>(() => {
    return store.getBookings().filter(b => b.customer_id === currentCustomer.id);
  });
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);

  const refreshBookings = () => {
    setUserBookings(store.getBookings().filter(b => b.customer_id === currentCustomer.id));
  };

  const handleCancelBooking = (booking: Booking) => {
    setCancelModalBooking(booking);
  };

  const handleExecuteCancellation = (
    refundAmount: number,
    refundReason: string,
    metTerms: boolean,
    noticeHours: number
  ) => {
    if (!cancelModalBooking) return;
    const targetBooking = cancelModalBooking;
    const nextStatus = refundAmount > 0 ? 'refunded' : 'cancelled';

    const result = PostgresEngine.updateBookingStatus(targetBooking.id, nextStatus, {
      refundAmount,
      refundReason,
      cancelledBy: 'customer',
      noticeHours,
      metTerms
    });

    if (result.success) {
      const businessDays = store.getCancellationSettings().processing_business_days || '5-7';
      if (refundAmount > 0) {
        alert(`Booking ${targetBooking.booking_ref} cancelled successfully!\n\nA refund of ₹${refundAmount} has been initiated and will reach your original payment method within ${businessDays} business days.`);
      } else {
        alert(`Booking ${targetBooking.booking_ref} cancelled.\n\nUnder venue terms, cancellations made within ${store.getCancellationSettings().cutoff_hours} hours of booking time are non-refundable (₹0 refund).`);
      }
      refreshBookings();
      setCancelModalBooking(null);
    } else {
      alert(result.message);
    }
  };

  const courts = store.getCourts();
  const sports = store.getSports();

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl animate-modalScaleIn text-on-surface">
        {/* Header */}
        <div className="p-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-headline font-bold text-lg text-primary leading-tight">My Verified Bookings</h3>
              <p className="text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Account: {currentCustomer.name} ({currentCustomer.phone.startsWith('+91') ? currentCustomer.phone : `+91 ${currentCustomer.phone}`})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {userBookings.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-14 h-14 bg-surface-container-low text-on-surface-variant/40 rounded-full flex items-center justify-center mx-auto text-2xl">
                🎟️
              </div>
              <h4 className="font-headline font-bold text-base text-on-surface">No Bookings Found</h4>
              <p className="text-xs text-on-surface-variant max-w-xs mx-auto">
                You don't have any active or past court reservations associated with this verified phone number yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {userBookings.map(b => {
                const court = courts.find(c => c.id === b.court_id);
                const sport = sports.find(s => s.id === b.sport_id);
                const bookingStart = new Date(`${b.booking_date}T${b.start_time}:00`);
                const diffHours = (bookingStart.getTime() - Date.now()) / (1000 * 60 * 60);
                const canCancel = diffHours > 0 && (b.status === 'confirmed' || b.status === 'pending_payment');
                const settings = store.getCancellationSettings();
                const metTerms = diffHours >= settings.cutoff_hours;
                const refundAmt = metTerms ? Math.round((b.total_amount * settings.refund_percentage) / 100) : 0;

                return (
                  <div
                    key={b.id}
                    className="border border-outline-variant/60 rounded-2xl p-4 space-y-3 bg-surface-container-lowest hover:border-primary/40 transition shadow-xs"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-primary">{b.booking_ref}</span>
                          <span
                            className={`badge ${
                              b.status === 'confirmed'
                                ? 'badge-online'
                                : b.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : b.status === 'cancelled' || b.status === 'refunded'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {b.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <h4 className="font-headline font-bold text-sm text-on-surface mt-1">
                          {sport?.icon} {court?.name || 'Court'}
                        </h4>
                      </div>
                      <div className="text-right">
                        <div className="font-headline font-extrabold text-sm text-primary">₹{b.total_amount}</div>
                        {b.status === 'refunded' && b.refund_amount !== undefined && (
                          <div className="text-[11px] font-bold text-emerald-700">Refund: ₹{b.refund_amount}</div>
                        )}
                        <span className="text-[10px] text-on-surface-variant uppercase font-medium">{b.source.replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-on-surface-variant bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/30">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-on-surface-variant/70">Date</span>
                        <span className="font-bold text-on-surface">{formatDateDDMMYYYY(b.booking_date)}</span>
                      </div>
                      <div className="h-6 border-r border-outline-variant/40" />
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-on-surface-variant/70">Slot Time</span>
                        <span className="font-bold text-on-surface">{formatTimeRange12h(b.start_time, b.end_time)}</span>
                      </div>
                    </div>

                    {/* Self-Serve Cancellation Section */}
                    {canCancel && (
                      <div className="pt-2 border-t border-outline-variant/30 flex justify-between items-center text-xs">
                        <div className="text-[11px] text-on-surface-variant">
                          <span>Cancellation Terms: </span>
                          <strong className={metTerms ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                            {metTerms ? `${settings.refund_percentage}% Refund (₹${refundAmt})` : `Non-refundable (< ${settings.cutoff_hours}h)`}
                          </strong>
                        </div>
                        <button
                          onClick={() => handleCancelBooking(b)}
                          className="px-3 py-1.5 rounded-xl bg-error/10 text-error hover:bg-error/20 font-headline font-bold flex items-center gap-1 transition"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel Reservation
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cancellation Confirmation Modal */}
        <CancelBookingConfirmModal
          booking={cancelModalBooking}
          isOpen={!!cancelModalBooking}
          onClose={() => setCancelModalBooking(null)}
          onConfirmed={handleExecuteCancellation}
        />
      </div>
    </div>
  );
};
