import React from 'react';
import { store } from '../../services/store';
import { CheckCircle2, Calendar, MapPin, MessageSquare, Download, X } from 'lucide-react';

interface BookingConfirmationModalProps {
  bookingRef: string;
  onClose: () => void;
}

export const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({ bookingRef, onClose }) => {
  const booking = store.getBookings().find(b => b.booking_ref === bookingRef);
  const venue = store.getVenue();
  const court = store.getCourts().find(c => c.id === booking?.court_id);
  const notif = store.getNotificationLogs().find(n => n.booking_id === booking?.id);

  const downloadIcsCalendar = () => {
    if (!booking) return;
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TurfFlow//Booking Platform//EN
BEGIN:VEVENT
SUMMARY:Game at ${venue.name} (${court?.name})
DESCRIPTION:Booking Reference: ${booking.booking_ref}. Venue address: ${venue.address}
LOCATION:${venue.address}
DTSTART:${booking.booking_date.replace(/-/g, '')}T${booking.start_time.replace(':', '')}00
DTEND:${booking.booking_date.replace(/-/g, '')}T${booking.end_time.replace(':', '')}00
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `booking-${booking.booking_ref}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!booking) return null;

  return (
    <div className="modal-backdrop">
      <div className="bg-[#131b2e] border border-[#24304f] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fadeIn">
        {/* Header */}
        <div className="p-6 bg-gradient-to-b from-emerald-950/60 to-transparent text-center border-b border-[#24304f]">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="font-extrabold text-2xl text-white">Booking Confirmed!</h2>
          <p className="text-xs text-emerald-400 font-mono mt-1 font-semibold">REF: {booking.booking_ref}</p>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <div className="bg-[#0f172a] p-4 rounded-xl border border-[#24304f] space-y-2.5">
            <div className="flex justify-between items-center text-gray-300">
              <span className="font-medium text-gray-400">Venue</span>
              <span className="font-semibold text-white">{venue.name}</span>
            </div>
            <div className="flex justify-between items-center text-gray-300">
              <span className="font-medium text-gray-400">Court</span>
              <span className="font-semibold text-white">{court?.name}</span>
            </div>
            <div className="flex justify-between items-center text-gray-300">
              <span className="font-medium text-gray-400">Date & Time</span>
              <span className="font-semibold text-emerald-400">
                {booking.booking_date} | {booking.start_time} - {booking.end_time}
              </span>
            </div>
            <div className="flex justify-between items-center text-gray-300">
              <span className="font-medium text-gray-400">Total Paid</span>
              <span className="font-bold text-white text-sm">₹{booking.total_amount}</span>
            </div>
          </div>

          {/* Venue Map link */}
          <div className="flex items-start gap-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-gray-300">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Venue Location</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{venue.address}</p>
            </div>
          </div>

          {/* WhatsApp / SMS Notification Sent Preview */}
          {notif && (
            <div className="bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-lg text-emerald-300 flex items-start gap-2">
              <MessageSquare className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-200">WhatsApp Confirmation Sent</p>
                <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{notif.message_preview}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={downloadIcsCalendar}
              className="btn btn-secondary w-full text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4 text-emerald-400" /> Add to Calendar (.ics)
            </button>

            <button
              onClick={onClose}
              className="btn btn-primary w-full text-xs font-bold"
            >
              Done & Return to Booking Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
