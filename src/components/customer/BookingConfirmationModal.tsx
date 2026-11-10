import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { store } from '../../services/store';
import { formatTimeRange12h, formatTime12hPlain, formatDateDDMMYYYY, formatPhoneNumber, getBookingGatePassOtp, getBookingGroupRef } from '../../utils/formatters';
import { TimeOfDayIcon, getTimeOfDaySvg } from '../common/TimeOfDayIcon';
import { 
  CheckCircle2, MapPin, MessageSquare, Download, X, KeyRound, Printer, 
  Trophy, Calendar, Clock, User, CreditCard, Ticket, FileDown, Layers,
  QrCode, ExternalLink
} from 'lucide-react';

interface BookingConfirmationModalProps {
  bookingRef: string;
  onClose: () => void;
}

export const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({ bookingRef, onClose }) => {
  const [cachedBooking, setCachedBooking] = useState(() => 
    store.getBookings().find(b => b.booking_ref === bookingRef || b.group_ref === bookingRef)
  );

  React.useEffect(() => {
    const found = store.getBookings().find(b => b.booking_ref === bookingRef || b.group_ref === bookingRef);
    if (found) {
      setCachedBooking(found);
    }
  }, [bookingRef]);

  const allBookings = store.getBookings();
  const booking = cachedBooking || allBookings.find(b => b.booking_ref === bookingRef || b.group_ref === bookingRef);
  const venue = store.getVenue();

  if (!booking) return null;

  // Resolve group reference and all sibling bookings for multi-slot orders
  const groupRef = getBookingGroupRef(booking);
  const isActiveBooking = booking.status !== 'cancelled' && booking.status !== 'refunded';
  const siblingBookings = allBookings.filter(b => 
    (isActiveBooking ? (b.status !== 'cancelled' && b.status !== 'refunded') : b.id === booking.id) &&
    (getBookingGroupRef(b) === groupRef ||
     (b.group_ref && b.group_ref === groupRef) || 
     b.booking_ref === groupRef || 
     (booking.gateway_payment_id && booking.gateway_payment_id !== '' && b.gateway_payment_id === booking.gateway_payment_id))
  );

  // Extract all slots: collect active slots from sibling bookings
  const allSlots: Array<{ start_time: string; end_time: string; price?: number }> = 
    Array.from(new Map(siblingBookings.map(b => [`${b.start_time}-${b.end_time}`, {
      start_time: b.start_time,
      end_time: b.end_time,
      price: b.total_amount
    }])).values()).sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Grand total paid across all active slots
  const grandTotalPaid = siblingBookings.length > 0 
    ? siblingBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
    : (booking.total_order_amount ?? booking.total_amount);

  const formattedSlotsStr = booking.formatted_slots || 
    allSlots.map(s => formatTimeRange12h(s.start_time, s.end_time)).join(', ');

  const otpCode = getBookingGatePassOtp(booking);

  const court = store.getCourts().find(c => c.id === booking?.court_id);
  const customer = store.getCustomers().find(c => c.id === booking.customer_id);
  const rawPhone = customer?.phone || booking.customer_phone || '';
  const cleanPhone = formatPhoneNumber(rawPhone);
  const notif = store.getNotificationLogs().find(n => n.booking_id === booking?.id && n.channel !== 'email');
  const emailNotif = store.getNotificationLogs().find(n => n.booking_id === booking?.id && n.channel === 'email');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [locationQrDataUrl, setLocationQrDataUrl] = useState<string>('');

  const venueLocationUrl = venue.location_url || venue.google_maps_link || `https://maps.google.com/?q=${encodeURIComponent(venue.name + ', ' + venue.address)}`;

  useEffect(() => {
    QRCode.toDataURL(venueLocationUrl, { margin: 1, width: 160 })
      .then(url => setLocationQrDataUrl(url))
      .catch(() => setLocationQrDataUrl(''));
  }, [venueLocationUrl]);

  const handleDownloadPdfFile = async () => {
    setIsDownloadingPdf(true);
    try {
      const fullBookingPayload = {
        ...booking,
        booking_ref: groupRef,
        group_ref: groupRef,
        court_name: court?.name || 'Turf Pitch',
        sport_name: court?.sport_ids?.join(' / ') || 'Football',
        customer_name: customer?.name || 'Customer',
        customer_phone: customer?.phone || '',
        gate_pass_otp: otpCode,
        total_amount: grandTotalPaid,
        total_order_amount: grandTotalPaid,
        all_slots: allSlots,
        formatted_slots: formattedSlotsStr
      };

      // 1. Try POST to generate-pass-pdf with complete client payload
      let res = await fetch('/api/bookings/generate-pass-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: fullBookingPayload })
      });

      // 2. Fallback to GET endpoint
      if (!res.ok) {
        res = await fetch(`/api/bookings/${groupRef}/pass.pdf`);
      }

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GatePass-${groupRef}.pdf`;
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

  const handleDownloadPdfPass = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Venue Entry Pass - ${groupRef}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
          .ticket-card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 2px solid #006b30; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
          .ticket-header { background: #006b30; color: #ffffff; padding: 24px; text-align: center; }
          .ticket-header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
          .ticket-header p { margin: 6px 0 0 0; font-size: 12px; font-weight: 700; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; justify-content: center; gap: 6px; }
          .ticket-body { padding: 24px; }
          .otp-box { background: #fffbeb; color: #92400e; text-align: center; padding: 20px; border-radius: 14px; margin: 16px 0; border: 2px dashed #f59e0b; }
          .otp-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; justify-content: center; gap: 6px; }
          .otp-code { font-size: 42px; font-weight: 900; font-family: monospace; letter-spacing: 12px; margin: 8px 0; color: #b45309; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          .info-item { font-size: 13px; }
          .info-label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; display: flex; align-items: center; gap: 5px; margin-bottom: 3px; }
          .info-value { font-weight: 700; color: #0f172a; }
          .ticket-footer { background: #f1f4f6; text-align: center; padding: 16px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
          .no-print-bar { max-width: 600px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; }
          .btn-print { background: #006b30; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
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
          <button onclick="window.print()" class="btn-print">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
            Save as PDF / Print Pass
          </button>
        </div>

        <div class="ticket-card">
          <div class="ticket-header">
            <h1>${venue.name}</h1>
            <p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              OFFICIAL VENUE ENTRY PASS & RECEIPT
            </p>
          </div>

          <div class="ticket-body">
            <div class="otp-box">
              <div class="otp-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
                <span>4-Digit Common Gate Check-in Pass</span>
              </div>
              <div class="otp-code">${otpCode}</div>
              <div style="font-size: 11px; font-weight: 700;">
                ${allSlots.length > 1 ? `Valid for all ${allSlots.length} reserved sessions below` : 'Show this 4-digit code to the gate manager for check-in'}
              </div>
            </div>

            <!-- Booked Sessions List -->
            <div style="margin: 16px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <div style="background: #f1f5f9; padding: 10px 14px; font-size: 11px; font-weight: 800; color: #1e293b; display: flex; justify-content: space-between; letter-spacing: 0.5px;">
                <span>RESERVED SESSION TIMINGS (${allSlots.length} ${allSlots.length === 1 ? 'SESSION' : 'SESSIONS'})</span>
                <span style="color: #006b30; font-weight: 700;">COMMON PASS</span>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <tbody>
                  ${allSlots.map((s, idx) => `
                    <tr style="border-top: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding: 10px 14px; font-weight: 700; color: #006b30; width: 25%;">Slot ${idx + 1}</td>
                      <td style="padding: 10px 14px; font-weight: 800; color: #0f172a;">${getTimeOfDaySvg(s.start_time)} ${formatTime12hPlain(s.start_time)} – ${getTimeOfDaySvg(s.end_time)} ${formatTime12hPlain(s.end_time)}</td>
                      <td style="padding: 10px 14px; color: #64748b; text-align: right;">${court?.name || 'Main Pitch'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
                  Booking Reference
                </span>
                <span class="info-value" style="color: #006b30; font-family: monospace;">${groupRef}</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                  Reserved Pitch
                </span>
                <span class="info-value">${court?.name || 'Pitch'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                  Booking Date
                </span>
                <span class="info-value">${formatDateDDMMYYYY(booking.booking_date)}</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Total Sessions
                </span>
                <span class="info-value">${allSlots.length} ${allSlots.length === 1 ? 'Slot' : 'Slots'} (${allSlots.length * 60} mins)</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Customer Name
                </span>
                <span class="info-value">${customer?.name || 'Customer'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Mobile Phone
                </span>
                <span class="info-value">${cleanPhone}</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  Total Amount Paid
                </span>
                <span class="info-value" style="font-size: 16px; color: #006b30;">₹${grandTotalPaid} (PAID)</span>
              </div>
              <div class="info-item">
                <span class="info-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                  Payment Status
                </span>
                <span class="info-value" style="color: #006b30;">VERIFIED (Razorpay Live)</span>
              </div>
            </div>

            <div style="margin-top: 20px; padding: 14px; background: #f8fafc; border-radius: 12px; font-size: 11px; color: #475569; border: 1px solid #e2e8f0; display: flex; gap: 16px; align-items: center;">
              ${locationQrDataUrl ? `
              <div style="text-align: center; flex-shrink: 0; background: #ffffff; padding: 6px; border-radius: 8px; border: 1px solid #cbd5e1;">
                <img src="${locationQrDataUrl}" alt="Turf Location QR" style="width: 82px; height: 82px; display: block;" />
                <span style="display: block; font-size: 8px; font-weight: 800; color: #006b30; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px;">Scan Location</span>
              </div>
              ` : ''}
              <div style="flex: 1; line-height: 1.6;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  <strong>Venue Location:</strong> ${venue.address}
                </div>
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <strong>GSTIN:</strong> ${venue.gst_number || '27AABCT1234F1Z0'} &bull; <strong>Contact:</strong> ${venue.contact_phone}
                </div>
                <div style="margin-top: 6px;">
                  <a href="${venueLocationUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 5px; color: #006b30; font-weight: 800; text-decoration: none; background: #e8f5e9; padding: 4px 10px; border-radius: 6px; border: 1px solid #a5d6a7; font-size: 11px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                    Open Directions in Google Maps &rarr;
                  </a>
                </div>
              </div>
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
        className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-md shadow-2xl animate-modalScaleIn text-on-surface flex flex-col overflow-hidden"
      >
        {/* Header - Compact & Clean */}
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-primary/10 text-primary border border-primary/20 rounded-xl flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-headline font-bold text-sm sm:text-base text-primary leading-tight truncate">Booking Confirmed!</h2>
                <span className="bg-primary/10 text-primary text-[9.5px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider shrink-0">
                  Paid
                </span>
                {allSlots.length > 1 && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                    {allSlots.length} Slots
                  </span>
                )}
              </div>
              <p className="text-[10px] text-on-surface-variant font-mono mt-0.5 truncate">
                Ref: {groupRef}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body - Zero Scroll Mobile Fit */}
        <div className="p-3 sm:p-4 space-y-2.5 text-xs overflow-hidden">
          
          {/* Prominent 4-Digit Common Gate Check-in OTP Pass Card */}
          <div className="bg-[#fffbeb] border-2 border-dashed border-[#f59e0b] p-2.5 sm:p-3 rounded-xl text-center shadow-xs">
            <div className="flex items-center justify-center gap-1.5 text-[#92400e] font-headline font-extrabold text-[10px] uppercase tracking-wider">
              <KeyRound className="w-3.5 h-3.5 text-[#b45309]" />
              <span>4-Digit Common Gate Pass</span>
              <Ticket className="w-3.5 h-3.5 text-[#b45309]" />
            </div>
            <div className="font-mono font-black text-2xl sm:text-3xl text-[#b45309] tracking-[0.25em] py-0.5">
              {otpCode}
            </div>
            <p className="text-[10px] text-[#92400e] font-medium leading-tight">
              {allSlots.length > 1 
                ? `Single common pass valid for all ${allSlots.length} reserved sessions`
                : 'Show this 4-digit OTP or downloaded PDF at the gate for entry'}
            </p>
          </div>

          {/* Reserved Slot Sessions Summary (When multi-slot) */}
          {allSlots.length > 1 && (
            <div className="bg-surface-container-low px-2.5 py-1.5 rounded-xl border border-outline-variant/30 flex items-center justify-between text-[11px]">
              <span className="font-bold text-on-surface flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-primary" /> {allSlots.length} Sessions Reserved
              </span>
              <span className="font-bold text-primary text-xs inline-flex items-center gap-1">
                <TimeOfDayIcon time24={allSlots[0].start_time} className="w-3.5 h-3.5" />
                <span>{formatTime12hPlain(allSlots[0].start_time)}</span>
                <span>–</span>
                <TimeOfDayIcon time24={allSlots[allSlots.length - 1].end_time} className="w-3.5 h-3.5" />
                <span>{formatTime12hPlain(allSlots[allSlots.length - 1].end_time)}</span>
              </span>
            </div>
          )}

          {/* Match & Pitch Details Grid (Compact 2-Column) */}
          <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/40 grid grid-cols-2 gap-2 text-left text-xs">
            <div>
              <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                <Trophy className="w-3 h-3 text-primary" /> Pitch
              </span>
              <span className="font-headline font-bold text-on-surface text-xs leading-tight block mt-0.5 truncate">{court?.name}</span>
            </div>
            <div>
              <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-primary" /> Date & Time
              </span>
              <div className="mt-0.5">
                <span className="font-headline font-bold text-on-surface text-xs block leading-tight">
                  {formatDateDDMMYYYY(booking.booking_date)}
                </span>
                {allSlots.length === 1 && allSlots[0] ? (
                  <div className="font-headline font-bold text-primary text-[11px] leading-tight mt-0.5 flex items-center gap-1 flex-wrap">
                    <TimeOfDayIcon time24={allSlots[0].start_time} className="w-3 h-3" />
                    <span>{formatTime12hPlain(allSlots[0].start_time)}</span>
                    <span>–</span>
                    <TimeOfDayIcon time24={allSlots[0].end_time} className="w-3 h-3" />
                    <span>{formatTime12hPlain(allSlots[0].end_time)}</span>
                  </div>
                ) : (
                  <span className="font-headline font-bold text-primary text-[11px] block leading-tight mt-0.5">
                    {allSlots.length} Sessions
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3 text-primary" /> Customer
              </span>
              <span className="font-medium text-on-surface text-xs block mt-0.5 truncate">{customer?.name || 'Player'}</span>
            </div>
            <div>
              <span className="text-[9.5px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-primary" /> Amount Paid
              </span>
              <span className="font-headline font-extrabold text-primary text-xs sm:text-sm block mt-0.5">₹{grandTotalPaid}</span>
            </div>
          </div>

          {/* Venue Location & WhatsApp Status in 1 neat row */}
          <div className="flex items-center justify-between bg-surface-container-low px-2.5 py-1.5 rounded-xl border border-outline-variant/30 text-[10.5px]">
            <a
              href={venueLocationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-primary hover:underline truncate min-w-0 pr-2 font-semibold"
              title="Open directions in Google Maps"
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">{venue.name} • {venue.address}</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
            </a>
            <span className="text-emerald-700 font-semibold flex items-center gap-1 shrink-0">
              <MessageSquare className="w-3 h-3 text-emerald-600" /> WhatsApp Pass Sent ({cleanPhone})
            </span>
          </div>

          {/* Actions: Download PDF Pass as Primary Button + Secondary Row */}
          <div className="space-y-1.5 pt-0.5">
            <button
              onClick={handleDownloadPdfFile}
              disabled={isDownloadingPdf}
              className="btn-cta w-full py-2 text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition cursor-pointer disabled:opacity-60"
            >
              <FileDown className={`w-3.5 h-3.5 ${isDownloadingPdf ? 'animate-bounce' : ''}`} /> 
              {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF Gate Pass'}
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleDownloadPdfPass}
                className="btn-secondary py-1.5 text-xs font-headline font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Printer className="w-3 h-3" /> Print / View
              </button>

              <button
                onClick={onClose}
                className="py-1.5 text-xs font-headline font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition cursor-pointer text-center"
              >
                Done
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
