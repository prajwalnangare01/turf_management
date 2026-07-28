import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { Booking } from '../../types/schema';
import { Search, Calendar, RefreshCw, XCircle, AlertCircle, X } from 'lucide-react';

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
      // Refresh search
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
    <div className="modal-backdrop">
      <div className="bg-[#131b2e] border border-[#24304f] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-4 bg-[#0b0f19] border-b border-[#24304f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-lg text-white">Look Up My Bookings</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="tel"
              required
              maxLength={10}
              placeholder="Enter 10-digit mobile number (e.g. 9876543210)"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              className="input-field flex-1 text-xs"
            />
            <button type="submit" className="btn btn-primary text-xs px-4 flex items-center gap-1">
              <Search className="w-4 h-4" /> Find
            </button>
          </form>

          {searched && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {userBookings.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-400" />
                  No bookings found for mobile number <strong>+91 {phone}</strong>
                </div>
              ) : (
                userBookings.map(b => {
                  const court = store.getCourts().find(c => c.id === b.court_id);
                  const { refundPct, refundAmount } = calculateRefund(b);
                  const canCancel = b.status === 'confirmed' || b.status === 'pending_payment';

                  return (
                    <div key={b.id} className="bg-[#0f172a] p-4 rounded-xl border border-[#24304f] space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-semibold text-emerald-400">{b.booking_ref}</span>
                        <span className={`badge ${
                          b.status === 'confirmed' ? 'badge-available' :
                          b.status === 'completed' ? 'badge-offline' : 'badge-online'
                        }`}>
                          {b.status}
                        </span>
                      </div>

                      <div className="text-gray-300">
                        <p className="font-semibold text-white">{court?.name}</p>
                        <p className="text-gray-400 text-[11px]">
                          {b.booking_date} | {b.start_time} - {b.end_time}
                        </p>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-[#24304f] text-gray-400">
                        <span>Paid: <strong className="text-white">₹{b.total_amount}</strong></span>

                        {canCancel && (
                          <button
                            onClick={() => handleCancelBooking(b)}
                            className="btn btn-danger text-[11px] px-2.5 py-1 flex items-center gap-1"
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
