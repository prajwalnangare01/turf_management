import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Booking, Customer } from '../../types/schema';
import { CancelBookingConfirmModal } from './CancelBookingConfirmModal';
import { Calendar, XCircle, AlertCircle, X, ShieldCheck, Tag, RotateCcw, Ticket, CloudRain } from 'lucide-react';
import { formatDateDDMMYYYY, formatTimeRange12h } from '../../utils/formatters';

interface BookingLookupModalProps {
  currentCustomer: Customer;
  onClose: () => void;
}

export const BookingLookupModal: React.FC<BookingLookupModalProps> = ({ currentCustomer, onClose }) => {
  const currentDigits = currentCustomer.phone.replace(/\D/g, '').slice(-10);
  const getCustomerBookings = () => {
    const customerIds = new Set(
      store.getCustomers().filter(c => 
        c.id === currentCustomer.id || 
        (currentDigits && c.phone.replace(/\D/g, '').slice(-10) === currentDigits)
      ).map(c => c.id)
    );
    customerIds.add(currentCustomer.id);
    return store.getBookings()
      .filter(b => customerIds.has(b.customer_id) || (currentDigits && b.customer_phone && b.customer_phone.replace(/\D/g, '').slice(-10) === currentDigits))
      .sort((a, b) => {
        const timeA = new Date(`${a.booking_date}T${a.start_time}:00`).getTime() || 0;
        const timeB = new Date(`${b.booking_date}T${b.start_time}:00`).getTime() || 0;
        return timeB - timeA;
      });
  };

  const [userBookings, setUserBookings] = useState<Booking[]>(() => getCustomerBookings());
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);

  const refreshBookings = () => {
    setUserBookings(getCustomerBookings());
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
    if (!cancelModalBooking) return { success: false, message: 'No reservation selected' };
    const targetBooking = cancelModalBooking;
    // Customer cancellations always set status to 'cancelled' with refundAmount: 0.
    // Cancellations and refunds must be reviewed and selected by admin in the Admin Dashboard.
    const nextStatus = 'cancelled';

    const result = PostgresEngine.updateBookingStatus(targetBooking.id, nextStatus, {
      refundAmount: 0,
      refundReason,
      cancelledBy: 'customer',
      noticeHours,
      metTerms
    });

    if (result.success) {
      refreshBookings();
      return { success: true };
    } else {
      return { success: false, message: result.message };
    }
  };

  const courts = store.getCourts();
  const sports = store.getSports();

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden">
        {/* Header */}
        <div className="p-3.5 sm:p-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-headline font-bold text-base sm:text-lg text-primary leading-tight truncate">My Verified Bookings</h3>
              <p className="text-[11px] text-on-surface-variant flex items-center gap-1 font-medium truncate">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Account: {currentCustomer.name} ({currentCustomer.phone.startsWith('+91') ? currentCustomer.phone : `+91 ${currentCustomer.phone}`})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition shrink-0 cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 sm:p-5 space-y-3.5 overflow-y-auto overscroll-contain">
          {userBookings.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-14 h-14 bg-surface-container-low text-primary/60 border border-outline-variant/60 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <Ticket className="w-7 h-7 text-primary/70" />
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

                const isRainout = Boolean(
                  (b.refund_reason && (
                    b.refund_reason.toLowerCase().includes('rain') ||
                    b.refund_reason.toLowerCase().includes('weather') ||
                    b.refund_reason.includes('Emergency Rainout')
                  )) ||
                  (b.cancellation_reason && (
                    b.cancellation_reason.toLowerCase().includes('rain') ||
                    b.cancellation_reason.toLowerCase().includes('weather') ||
                    b.cancellation_reason.includes('Emergency Rainout')
                  )) ||
                  (b.cancelled_by === 'admin' && (b.refund_reason?.toLowerCase().includes('rain') || b.notes?.toLowerCase().includes('rain')))
                );

                return (
                  <div
                    key={b.id}
                    className="border border-outline-variant/60 rounded-2xl p-4 space-y-3 bg-surface-container-lowest hover:border-primary/40 transition shadow-xs"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-primary">{b.booking_ref}</span>
                          <span
                            className={`badge ${
                              b.status === 'confirmed'
                                ? 'badge-online'
                                : b.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : isRainout
                                ? 'bg-sky-100 text-sky-900 border-sky-300 font-bold'
                                : b.status === 'cancelled' || b.status === 'refunded'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {isRainout ? '🌧️ RAINOUT (OWNER CANCEL)' : b.status.replace('_', ' ').toUpperCase()}
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

                    {/* Cancellation Notice Strip (Rainout vs Standard) */}
                    {(b.status === 'cancelled' || b.status === 'refunded') && (
                      isRainout ? (
                        <div className="bg-sky-50/90 border border-sky-200 rounded-xl p-3 space-y-1.5 text-sky-950">
                          <div className="flex items-center justify-between text-xs font-bold text-sky-900 flex-wrap gap-1">
                            <span className="flex items-center gap-1.5">
                              <CloudRain className="w-4 h-4 text-sky-600 animate-pulse" />
                              <span>Cancelled by Turf Owner (Rainout)</span>
                            </span>
                            <span className="bg-sky-200 text-sky-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-sky-300">
                              100% Refund: ₹{b.refund_amount || b.total_amount}
                            </span>
                          </div>
                          <p className="text-[11px] text-sky-900 font-medium leading-relaxed">
                            This slot was proactively cancelled by the venue owner due to heavy rain and pitch waterlogging. A 100% full refund of ₹{b.refund_amount || b.total_amount} has been initiated back to your original payment method.
                          </p>
                          {b.refund_reason && (
                            <p className="text-[10px] text-sky-700 font-mono italic">
                              Owner Note: {b.refund_reason.replace('[Emergency Rainout]', '').trim()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="bg-red-50/80 border border-red-200 rounded-xl p-2.5 text-xs text-red-900 space-y-0.5">
                          <div className="flex items-center justify-between font-bold">
                            <span>{b.cancelled_by === 'customer' ? 'Reservation Cancelled by You' : 'Cancelled by Turf Management'}</span>
                            {b.refund_amount !== undefined && b.refund_amount > 0 && (
                              <span className="text-emerald-700 font-bold">Refund: ₹{b.refund_amount}</span>
                            )}
                          </div>
                          {b.refund_reason && (
                            <p className="text-[10.5px] text-red-800">Reason: {b.refund_reason}</p>
                          )}
                        </div>
                      )
                    )}

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
          onSuccessDone={() => setCancelModalBooking(null)}
        />
      </div>
    </div>
  );
};
