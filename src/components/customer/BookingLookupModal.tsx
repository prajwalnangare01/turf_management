import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Booking } from '../../types/schema';
import { Search, Calendar, XCircle, AlertCircle, X } from 'lucide-react';

interface BookingLookupModalProps {
  onClose: () => void;
}

export const BookingLookupModal: React.FC<BookingLookupModalProps> = ({ onClose }) => {
  const [phone, setPhone] = useState('');
  const [searched, setSearched] = useState(false);
  const [userBookings, setUserBookings] = useState<Booking[]>([]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) return;

    const customers = store.getCustomers();
    const customer = customers.find(c => c.phone === phone);

    if (!customer) {
      setUserBookings([]);
      setSearched(true);
      return;
    }

    const bookings = store.getBookings().filter(b => b.customer_id === customer.id);
    setUserBookings(bookings);
    setSearched(true);
  };

  const calculateRefund = (booking: Booking) => {
    const bookingTimeStr = `${booking.booking_date}T${booking.start_time}:00`;
    const bookingDate = new Date(bookingTimeStr);
    const now = new Date();
    const diffHours = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const policies = store.getCancellationPolicies().sort((a, b) => b.hours_before_start - a.hours_before_start);
    let refundPct = 0;

    for (const p of policies) {
      if (diffHours >= p.hours_before_start) {
        refundPct = p.refund_percentage;
        break;
      }
    }

    const refundAmount = Math.round((booking.total_amount * refundPct) / 100);
    return { diffHours, refundPct, refundAmount };
  };

  const handleCancelBooking = (booking: Booking) => {
    const { refundPct, refundAmount } = calculateRefund(booking);

    const confirmMsg = `Are you sure you want to cancel booking ${booking.booking_ref}?\n\nCancellation Policy:\n- Refund percentage: ${refundPct}%\n- Estimated refund: ₹${refundAmount}`;
    if (!confirm(confirmMsg)) return;

    const result = PostgresEngine.updateBookingStatus(booking.id, refundPct > 0 ? 'refunded' : 'cancelled');
    if (result.success) {
      alert(`Booking ${booking.booking_ref} has been cancelled. Refund of ₹${refundAmount} initiated.`);
      const customers = store.getCustomers();
      const customer = customers.find(c => c.phone === phone);
      if (customer) {
        setUserBookings(store.getBookings().filter(b => b.customer_id === customer.id));
      }
    } else {
      alert(result.message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl animate-modalScaleIn text-on-surface">
        <div className="p-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h3 className="font-headline font-bold text-xl text-primary">My Bookings & Tickets</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="tel"
              required
              maxLength={10}
              placeholder="Enter 10-digit mobile number (e.g. 9876543210)"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              className="form-input flex-1 text-xs"
            />
            <button type="submit" className="btn-primary text-xs px-5 font-bold flex items-center gap-1 shrink-0">
              <Search className="w-4 h-4" /> Find Bookings
            </button>
          </form>

          {searched && (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {userBookings.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant text-xs bg-surface-container-low rounded-xl border border-outline-variant/30">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-60 text-secondary" />
                  No active or past bookings found for <strong>+91 {phone}</strong>
                </div>
              ) : (
                userBookings.map(b => {
                  const court = store.getCourts().find(c => c.id === b.court_id);
                  const { refundPct, refundAmount } = calculateRefund(b);
                  const canCancel = b.status === 'confirmed' || b.status === 'pending_payment';

                  return (
                    <div key={b.id} className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/50 space-y-2 text-xs shadow-sm">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded text-xs">
                            {b.booking_ref}
                          </span>
                          <span className="font-mono font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded text-[11px]">
                            OTP: {b.booking_ref.slice(-4)}
                          </span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full font-headline font-bold text-[10px] uppercase ${
                          b.status === 'confirmed' ? 'bg-primary/10 text-primary border border-primary/20' :
                          b.status === 'completed' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {b.status}
                        </span>
                      </div>

                      <div>
                        <p className="font-headline font-bold text-sm text-on-surface">{court?.name}</p>
                        <p className="text-on-surface-variant text-[11px] font-medium">
                          {b.booking_date} | {b.start_time} - {b.end_time}
                        </p>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-outline-variant/30">
                        <span className="text-on-surface-variant">
                          Total Paid: <strong className="font-headline font-extrabold text-primary text-sm">₹{b.total_amount}</strong>
                        </span>

                        {canCancel && (
                          <button
                            onClick={() => handleCancelBooking(b)}
                            className="bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-lg text-[11px] font-bold hover:bg-red-100 flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Cancel ({refundPct}% Refund = ₹{refundAmount})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
