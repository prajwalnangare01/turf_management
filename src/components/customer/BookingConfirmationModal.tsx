import React from 'react';
import { store } from '../../services/store';
import { formatTimeRange12h } from '../../utils/formatters';
import { CheckCircle2, MapPin, MessageSquare, Download, X, KeyRound } from 'lucide-react';

interface BookingConfirmationModalProps {
  bookingRef: string;
  onClose: () => void;
}

export const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({ bookingRef, onClose }) => {
  const booking = store.getBookings().find(b => b.booking_ref === bookingRef);
  const venue = store.getVenue();
  const court = store.getCourts().find(c => c.id === booking?.court_id);
  const notif = store.getNotificationLogs().find(n => n.booking_id === booking?.id);

  if (!booking) return null;

  const otpCode = booking.booking_ref.slice(-4);
  const customer = store.getCustomers().find(c => c.id === booking.customer_id);

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
          .no-print-bar { max-width: 600px; margin: 0 auto 16px auto; display: flex; justify-content: justify-between; align-items: center; }
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
                <span class="info-value">${booking.booking_date}</span>
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
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl animate-modalScaleIn text-on-surface">
        {/* Header */}
        <div className="p-6 bg-surface-container-low text-center border-b border-outline-variant/40 relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container">
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 bg-primary/10 text-primary border border-primary/30 rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="font-headline font-bold text-2xl text-primary">Booking Confirmed!</h2>
          <span className="inline-block bg-secondary-container text-on-secondary-container px-3 py-0.5 rounded-full font-mono text-xs font-bold mt-1 shadow-sm">
            REF: {booking.booking_ref}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Prominent 4-Digit Entry Verification OTP Pass Card */}
          <div className="bg-secondary-container/20 border-2 border-dashed border-secondary-container p-5 rounded-2xl text-center space-y-1 shadow-sm">
            <div className="flex items-center justify-center gap-1.5 text-on-secondary-container font-headline font-bold text-xs uppercase tracking-wider">
              <KeyRound className="w-4 h-4 text-secondary" />
              <span>4-Digit Gate Check-in OTP</span>
            </div>
            <div className="font-mono font-black text-4xl text-on-secondary-container tracking-[0.25em] py-1">
              {otpCode}
            </div>
            <p className="text-[11px] text-on-surface-variant font-medium">
              Show this 4-digit OTP or PDF Pass at the venue gate for check-in
            </p>
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 space-y-2.5">
            <div className="flex justify-between items-center text-on-surface-variant">
              <span className="font-medium">Venue:</span>
              <span className="font-headline font-bold text-on-surface text-sm">{venue.name}</span>
            </div>
            <div className="flex justify-between items-center text-on-surface-variant">
              <span className="font-medium">Selected Pitch:</span>
              <span className="font-headline font-bold text-on-surface text-sm">{court?.name}</span>
            </div>
            <div className="flex justify-between items-center text-on-surface-variant">
              <span className="font-medium">Date & Time:</span>
              <span className="font-headline font-bold text-primary text-xs">
                {booking.booking_date} | {formatTimeRange12h(booking.start_time, booking.end_time)}
              </span>
            </div>
            <div className="flex justify-between items-center text-on-surface-variant border-t border-outline-variant/30 pt-2">
              <span className="font-medium">Amount Paid:</span>
              <span className="font-headline font-extrabold text-primary text-base">₹{booking.total_amount}</span>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-start gap-2.5 bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 text-on-surface">
            <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-headline font-bold text-xs">Venue Location</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">{venue.address}</p>
            </div>
          </div>

          {/* WhatsApp Preview */}
          {notif && (
            <div className="bg-primary/10 border border-primary/20 p-3.5 rounded-xl text-primary flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
              <div>
                <p className="font-headline font-bold text-xs text-primary">WhatsApp Receipt Dispatched</p>
                <p className="text-[11px] text-on-surface opacity-90 mt-0.5 leading-relaxed">{notif.message_preview}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleDownloadPdfPass}
              className="btn-cta w-full py-3 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
            >
              <Download className="w-4 h-4" /> Download PDF Entry Pass & Receipt
            </button>

            <button
              onClick={onClose}
              className="btn-secondary w-full py-2.5 text-xs font-headline font-bold"
            >
              Done & Return to Homepage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
