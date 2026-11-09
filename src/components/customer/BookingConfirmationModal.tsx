import React, { useState } from 'react';
import { store } from '../../services/store';
import { formatTimeRange12h, formatDateDDMMYYYY } from '../../utils/formatters';
import { CheckCircle2, MapPin, MessageSquare, Download, X, KeyRound, Calendar, Printer } from 'lucide-react';

interface BookingConfirmationModalProps {
  bookingRef: string;
  onClose: () => void;
}

export const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({ bookingRef, onClose }) => {
  const [cachedBooking, setCachedBooking] = useState(() => 
    store.getBookings().find(b => b.booking_ref === bookingRef)
  );

  React.useEffect(() => {
    const found = store.getBookings().find(b => b.booking_ref === bookingRef);
    if (found) {
      setCachedBooking(found);
    }
  }, [bookingRef]);

  const booking = cachedBooking || store.getBookings().find(b => b.booking_ref === bookingRef);
  const venue = store.getVenue();
  const court = store.getCourts().find(c => c.id === booking?.court_id);
  const notif = store.getNotificationLogs().find(n => n.booking_id === booking?.id && n.channel !== 'email');
  const emailNotif = store.getNotificationLogs().find(n => n.booking_id === booking?.id && n.channel === 'email');

  if (!booking) return null;

  const otpCode = (booking.gate_pass_otp || booking.booking_ref || booking.id || '').slice(-4) || '----';
  const customer = store.getCustomers().find(c => c.id === booking.customer_id);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdfFile = async () => {
    setIsDownloadingPdf(true);
    try {
      const fullBookingPayload = {
        ...booking,
        court_name: court?.name || 'Turf Pitch',
        sport_name: court?.sport_ids?.join(' / ') || 'Football',
        customer_name: customer?.name || 'Customer',
        customer_phone: customer?.phone || '',
        gate_pass_otp: otpCode
      };

      // 1. Try POST to generate-pass-pdf with complete client payload
      let res = await fetch('/api/bookings/generate-pass-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: fullBookingPayload })
      });

      // 2. Fallback to GET endpoint
      if (!res.ok) {
        res = await fetch(`/api/bookings/${booking.booking_ref}/pass.pdf`);
      }

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GatePass-${booking.booking_ref}.pdf`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 300);
        return;
      }
    } catch (err) {
      console.warn('PDF download fallback to print:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
    handleDownloadPdfPass();
  };

  const handleDownloadCalendarIcs = () => {
    const cleanDate = booking.booking_date.replace(/-/g, '');
    const cleanStart = (booking.start_time || '00:00').replace(':', '') + '00';
    const cleanEnd = (booking.end_time || '00:00').replace(':', '') + '00';
    
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TurfFlow//Sports Venue Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${booking.booking_ref}@turfflow.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${cleanDate}T${cleanStart}`,
      `DTEND:${cleanDate}T${cleanEnd}`,
      `SUMMARY:Turf Game - ${court?.name || 'Pitch'} (${venue.name})`,
      `DESCRIPTION:Booking Ref: ${booking.booking_ref}\\nGate Pass OTP: ${otpCode}\\nTotal Paid: INR ${booking.total_amount}`,
      `LOCATION:${venue.name}, ${venue.address}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `turfflow-match-${booking.booking_ref}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdfPass = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Venue Entry Pass - ${booking.booking_ref}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
          .ticket-card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 2px solid #006b30; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
          .ticket-header { background: #006b30; color: #ffffff; padding: 24px; text-align: center; }
          .ticket-header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
          .ticket-header p { margin: 6px 0 0 0; font-size: 12px; font-weight: 700; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
          .ticket-body { padding: 24px; }
          .otp-box { background: #fe9400; color: #633700; text-align: center; padding: 20px; border-radius: 14px; margin: 16px 0; border: 2px dashed #8c5000; }
          .otp-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
          .otp-code { font-size: 42px; font-weight: 900; font-family: monospace; letter-spacing: 12px; margin: 8px 0; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          .info-item { font-size: 13px; }
          .info-label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px; }
          .info-value { font-weight: 700; color: #0f172a; }
          .ticket-footer { background: #f1f4f6; text-align: center; padding: 16px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
          .no-print-bar { max-width: 600px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; }
          @media print {
            body { background: white; padding: 0; }
            .no-print { display: none; }
            .ticket-card { box-shadow: none; border-color: #006b30; }
          }
        </style>
      </head>
      <body>
        <div class="no-print no-print-bar">
          <span style="font-size: 13px; color: #64748b; font-weight: 600;">Turf Official Gate Pass & Payment Receipt</span>
          <button onclick="window.print()" style="background: #006b30; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">🖨️ Save as PDF / Print Pass</button>
        </div>

        <div class="ticket-card">
          <div class="ticket-header">
            <h1>${venue.name}</h1>
            <p>OFFICIAL VENUE ENTRY PASS & RECEIPT</p>
          </div>

          <div class="ticket-body">
            <div class="otp-box">
              <div class="otp-title">4-Digit Gate Check-in OTP Pass</div>
              <div class="otp-code">${otpCode}</div>
              <div style="font-size: 11px; font-weight: 700;">Show this 4-digit code to the gate manager for check-in</div>
            </div>

            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Booking Reference</span>
                <span class="info-value" style="color: #006b30; font-family: monospace;">${booking.booking_ref}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Reserved Pitch</span>
                <span class="info-value">${court?.name || 'Pitch'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Booking Date</span>
                <span class="info-value">${formatDateDDMMYYYY(booking.booking_date)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Slot Time</span>
                <span class="info-value">${formatTimeRange12h(booking.start_time, booking.end_time)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Customer Name</span>
                <span class="info-value">${customer?.name || 'Customer'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Mobile Phone</span>
                <span class="info-value">+91 ${customer?.phone || ''}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Total Amount Paid</span>
                <span class="info-value" style="font-size: 16px; color: #006b30;">₹${booking.total_amount} (PAID)</span>
              </div>
              <div class="info-item">
                <span class="info-label">Payment Status</span>
                <span class="info-value" style="color: #006b30;">VERIFIED (Razorpay Live)</span>
              </div>
            </div>

            <div style="margin-top: 20px; padding: 14px; background: #f8fafc; border-radius: 10px; font-size: 11px; color: #475569; border: 1px solid #e2e8f0;">
              <strong>Venue Location:</strong> ${venue.address}<br/>
              <strong>GSTIN:</strong> ${venue.gst_number}<br/>
              <strong>Venue Contact:</strong> ${venue.contact_phone}
            </div>
          </div>

          <div class="ticket-footer">
            Thank you for booking with ${venue.name}. Please arrive 10 minutes prior to your slot time.
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="modal-overlay">
      <div 
        className="bg-white border border-outline-variant/60 rounded-3xl w-full max-w-lg shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden max-h-[92vh] overflow-y-auto no-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Header - Compact & Clean */}
        <div className="px-5 py-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 text-primary border border-primary/20 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline font-bold text-lg text-primary leading-tight">Booking Confirmed!</h2>
                <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Paid
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant font-mono mt-0.5">
                Ref: {booking.booking_ref}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-xl hover:bg-surface-container transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body - Compact, No Vertical Scrollbar */}
        <div className="p-4 sm:p-5 space-y-3.5 text-xs">
          
          {/* Prominent 4-Digit Gate Check-in OTP Pass Card */}
          <div className="bg-[#fffbeb] border-2 border-dashed border-[#f59e0b] p-3.5 rounded-2xl text-center shadow-xs">
            <div className="flex items-center justify-center gap-1.5 text-[#92400e] font-headline font-extrabold text-[11px] uppercase tracking-wider">
              <KeyRound className="w-4 h-4 text-[#b45309]" />
              <span>4-Digit Gate Check-in Pass</span>
            </div>
            <div className="font-mono font-black text-3xl sm:text-4xl text-[#b45309] tracking-[0.25em] py-1">
              {otpCode}
            </div>
            <p className="text-[11px] text-[#92400e] font-medium">
              Show this 4-digit OTP or downloaded PDF at the gate for match entry
            </p>
          </div>

          {/* Match & Pitch Details Grid (Compact 2-Column) */}
          <div className="bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/40 grid grid-cols-2 gap-2.5 text-left text-xs">
            <div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Pitch</span>
              <span className="font-headline font-bold text-on-surface text-xs leading-tight block mt-0.5">{court?.name}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Date & Timing</span>
              <span className="font-headline font-bold text-primary text-xs leading-tight block mt-0.5">
                {formatDateDDMMYYYY(booking.booking_date)} • {formatTimeRange12h(booking.start_time, booking.end_time)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Customer</span>
              <span className="font-medium text-on-surface text-xs block mt-0.5">{customer?.name || 'Player'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Amount Paid</span>
              <span className="font-headline font-extrabold text-primary text-sm block mt-0.5">₹{booking.total_amount}</span>
            </div>
          </div>

          {/* Venue Location Line */}
          <div className="flex items-center gap-2 bg-surface-container-low px-3.5 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface text-[11px]">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate text-on-surface-variant">
              <strong className="text-on-surface">{venue.name}</strong> • {venue.address}
            </span>
          </div>

          {/* Notification Dispatched Pill */}
          {(notif || emailNotif) && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-[11px] font-medium">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Gate Pass & receipt dispatched to WhatsApp (+91 {customer?.phone})</span>
            </div>
          )}

          {/* Actions: Download PDF Pass as Primary Button */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleDownloadPdfFile}
              disabled={isDownloadingPdf}
              className="btn-cta w-full py-3 text-xs sm:text-sm font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer disabled:opacity-60"
            >
              <Download className={`w-4 h-4 ${isDownloadingPdf ? 'animate-bounce' : ''}`} /> 
              {isDownloadingPdf ? 'Generating PDF Pass...' : 'Download PDF Gate Pass'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadPdfPass}
                className="btn-secondary py-2 text-xs font-headline font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Print / View Pass
              </button>

              <button
                onClick={handleDownloadCalendarIcs}
                className="btn-secondary py-2 text-xs font-headline font-bold flex items-center justify-center gap-1.5 border-primary/30 text-primary hover:bg-primary/5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-primary" /> Add Calendar (.ics)
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 text-xs font-headline font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition cursor-pointer"
            >
              Done & Return to Homepage
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
