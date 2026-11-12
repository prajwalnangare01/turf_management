// Gate Pass & Official PDF Ticket Generator Service for TurfFlow
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { store } from '../data/store.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';

function formatPhoneNumber(phoneInput) {
  if (!phoneInput) return '';
  const clean = String(phoneInput).trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `+91 ${last10}`;
  }
  return clean;
}

function getTimeOfDaySvg(time24) {
  if (!time24) return '';
  const clean = String(time24).trim();
  const parts = clean.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) {
    const match = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      h = parseInt(match[1], 10);
      const isPm = match[3] && match[3].toUpperCase() === 'PM';
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
    } else {
      return '';
    }
  }

  if (h >= 5 && h < 9) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 2v6"/><path d="m4.93 10.93 1.41 1.41"/><path d="M20 18h2"/><path d="M2 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`;
  } else if (h >= 9 && h < 16) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
  } else if (h >= 16 && h < 19) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M20 18h2"/><path d="M2 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`;
  } else {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  }
}

export class GatePassService {
  /**
   * Generate official PDF Gate Pass & Payment Receipt as a Buffer
   */
  static async generatePassPdfBuffer(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const sports = store.getSports();
    const sport = sports.find(s => s.id === booking.sport_id);
    const customer = store.getCustomers().find(c => c.id === booking.customer_id) || {
      name: booking.customer_name || 'Customer',
      phone: booking.customer_phone || ''
    };

    const rawCustomerPhone = customer.phone || booking.customer_phone || '';
    const cleanCustomerPhone = formatPhoneNumber(rawCustomerPhone);
    const otpCode = WhatsAppFormatter.getBookingGatePassOtp(booking);
    const courtName = (court?.name || booking.court_name || 'Turf Pitch').replace(/[^\x00-\x7F]/g, '');
    const sportName = (sport?.name || booking.sport_name || 'Football').replace(/[^\x00-\x7F]/g, '');

    // Resolve accurate venue location link
    const venueLocationUrl = venue.location_url || venue.google_maps_link || `https://maps.google.com/?q=${encodeURIComponent(venue.name + ', ' + venue.address)}`;

    // Generate Location QR code for directions / navigation
    const locationQrBuffer = await QRCode.toBuffer(venueLocationUrl, { margin: 1, width: 140 });

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', err => reject(err));

        const primaryColor = '#006B30';
        const darkColor = '#0F172A';
        const slateColor = '#475569';
        const goldBg = '#FFFBEB';
        const goldBorder = '#F59E0B';
        const goldText = '#92400E';

        // 1. Top Header Banner
        doc.rect(40, 40, 515, 75).fill(primaryColor);
        doc.fillColor('#FFFFFF')
          .fontSize(22)
          .font('Helvetica-Bold')
          .text(venue.name.toUpperCase(), 50, 55, { align: 'center', width: 495 });
        doc.fontSize(10)
          .font('Helvetica-Bold')
          .text('OFFICIAL VENUE ENTRY PASS & PAYMENT RECEIPT', 50, 85, { align: 'center', width: 495 });

        // 2. Gate Check-in OTP Box (Dashed Gold Box)
        doc.rect(50, 130, 495, 80).fillAndStroke(goldBg, goldBorder);
        doc.fillColor(goldText)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('4-DIGIT GATE CHECK-IN OTP PASS', 50, 142, { align: 'center', width: 495 });
        
        doc.fillColor('#B45309')
          .fontSize(36)
          .font('Helvetica-Bold')
          .text(otpCode.split('').join('  '), 50, 158, { align: 'center', width: 495 });

        doc.fillColor(goldText)
          .fontSize(9)
          .font('Helvetica')
          .text('Show this 4-digit code to the gate manager for check-in', 50, 196, { align: 'center', width: 495 });

        // 3. Booking Details Grid
        let y = 230;
        doc.rect(50, y, 495, 230).fillAndStroke('#FFFFFF', '#E2E8F0');

        // Column 1
        const drawField = (label, value, xPos, yPos, isHighlight = false) => {
          doc.fillColor(slateColor).fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), xPos, yPos);
          doc.fillColor(isHighlight ? primaryColor : darkColor)
            .fontSize(isHighlight ? 12 : 11)
            .font(isHighlight ? 'Helvetica-Bold' : 'Helvetica-Bold')
            .text(value, xPos, yPos + 12);
        };

        const validSlots = Array.isArray(booking.all_slots) ? booking.all_slots.filter(s => s.start_time && s.end_time) : [];
        const slotsToRender = validSlots.length > 1 
          ? validSlots 
          : [{
              start_time: booking.start_time,
              end_time: booking.end_time,
              price: booking.total_amount,
              booking_ref: booking.booking_ref
            }];

        slotsToRender.forEach((slot, slotIdx) => {
          if (slotIdx > 0) {
            doc.addPage({ size: 'A4', margin: 40 });
          }

          // 1. Top Header Banner
          doc.rect(40, 40, 515, 75).fill(primaryColor);
          doc.fillColor('#FFFFFF')
            .fontSize(22)
            .font('Helvetica-Bold')
            .text(venue.name.toUpperCase(), 50, 55, { align: 'center', width: 495 });
          doc.fontSize(10)
            .font('Helvetica-Bold')
            .text(
              slotsToRender.length > 1
                ? `OFFICIAL VENUE ENTRY PASS — PASS ${slotIdx + 1} OF ${slotsToRender.length}`
                : 'OFFICIAL VENUE ENTRY PASS & PAYMENT RECEIPT',
              50,
              85,
              { align: 'center', width: 495 }
            );

          // 2. Gate Check-in OTP Box (Dashed Gold Box)
          doc.rect(50, 130, 495, 80).fillAndStroke(goldBg, goldBorder);
          doc.fillColor(goldText)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('4-DIGIT GATE CHECK-IN OTP PASS', 50, 142, { align: 'center', width: 495 });
          
          doc.fillColor('#B45309')
            .fontSize(36)
            .font('Helvetica-Bold')
            .text(otpCode.split('').join('  '), 50, 158, { align: 'center', width: 495 });

          doc.fillColor(goldText)
            .fontSize(9)
            .font('Helvetica')
            .text(
              slotsToRender.length > 1
                ? `Common pass valid for all ${slotsToRender.length} reserved sessions`
                : 'Show this 4-digit code to the gate manager for check-in',
              50,
              196,
              { align: 'center', width: 495 }
            );

          // 3. Booking Details Grid
          let y = 230;
          doc.rect(50, y, 495, 230).fillAndStroke('#FFFFFF', '#E2E8F0');

          const slotTimingStr = (slot.start_time && slot.end_time)
            ? `${WhatsAppFormatter.formatTime(slot.start_time)} — ${WhatsAppFormatter.formatTime(slot.end_time)}`
            : (booking.start_time ? `${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)}` : 'Confirmed Slot');

          const slotRef = slot.booking_ref || (slotIdx === 0 ? booking.booking_ref : `${booking.group_ref || booking.booking_ref}-${slotIdx + 1}`);
          const slotAmountDisplay = `INR ${slot.price || booking.total_amount || 0} (PAID)`;

          drawField('Pass Reference', slotRef, 70, y + 15, true);
          drawField('Reserved Pitch', courtName, 310, y + 15);

          drawField('Sport', sportName, 70, y + 55);
          drawField('Match Date', WhatsAppFormatter.formatDate(booking.booking_date), 310, y + 55);

          drawField('Reserved Slot Timing', slotTimingStr, 70, y + 95, true);
          drawField('Customer Name', customer.name, 310, y + 95);

          drawField('Customer Phone', cleanCustomerPhone, 70, y + 135);
          drawField('Slot Amount Paid', slotAmountDisplay, 310, y + 135, true);

          drawField('Payment Status', 'VERIFIED (Razorpay Live UPI)', 70, y + 175);
          drawField('Common Group Ref', booking.group_ref || booking.booking_ref, 310, y + 175);

          // 4. Turf Location QR Code & Address Stamp
          y = 480;
          doc.rect(50, y, 495, 120).fillAndStroke('#F8FAFC', '#E2E8F0');
          
          // Draw Location QR Code
          doc.image(locationQrBuffer, 65, y + 10, { width: 95 });
          doc.fillColor(primaryColor)
            .fontSize(7)
            .font('Helvetica-Bold')
            .text('SCAN FOR GOOGLE MAPS', 55, y + 107, { width: 115, align: 'center' });

          doc.fillColor(darkColor)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('VENUE ADDRESS & DIRECTIONS', 185, y + 16);

          doc.fillColor(slateColor)
            .fontSize(9)
            .font('Helvetica')
            .text(venue.address, 185, y + 32, { width: 340 });

          doc.fillColor(darkColor)
            .fontSize(8.5)
            .font('Helvetica-Bold')
            .text(`GSTIN: ${venue.gst_number || '27AABCT1234F1Z0'}  |  Helpdesk: ${venue.contact_phone}`, 185, y + 66);

          doc.fillColor(primaryColor)
            .fontSize(8.5)
            .font('Helvetica-Bold')
            .text('Google Maps: ' + venueLocationUrl, 185, y + 84, { 
              width: 340,
              link: venueLocationUrl,
              underline: true 
            });

          // 5. Pitch Guidelines Box
          y = 620;
          doc.rect(50, y, 495, 90).fillAndStroke('#F1F5F9', '#CBD5E1');

          doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold').text('PITCH GUIDELINES & VENUE RULES:', 65, y + 12);
          
          const rules = [
            '• Turf shoes or flat rubber sole studs only (No metal spikes permitted on synthetic turf).',
            '• Please arrive at least 10 minutes prior to your reserved kick-off time.',
            '• Free drinking water, bibs, footballs, and changing rooms with showers provided.',
            '• For cancellations or rescheduling, visit the site or reply directly on WhatsApp.'
          ];

          let ruleY = y + 28;
          doc.fillColor(slateColor).fontSize(8).font('Helvetica');
          for (const rule of rules) {
            doc.text(rule, 65, ruleY);
            ruleY += 13;
          }

          // 6. Footer
          doc.fillColor('#94A3B8')
            .fontSize(8)
            .font('Helvetica')
            .text(`Generated automatically by TurfFlow Unified Platform on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 50, 740, { align: 'center', width: 495 });
        });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Return printable HTML string matching the website's Ticket Pass modal
   */
  static async generatePassHtml(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const customer = store.getCustomers().find(c => c.id === booking.customer_id) || {
      name: booking.customer_name || 'Customer',
      phone: booking.customer_phone || ''
    };
    const rawCustomerPhone = customer.phone || booking.customer_phone || '';
    const cleanCustomerPhone = formatPhoneNumber(rawCustomerPhone);
    const otpCode = WhatsAppFormatter.getBookingGatePassOtp(booking);

    // Resolve accurate venue location link & generate Location QR code
    const venueLocationUrl = venue.location_url || venue.google_maps_link || `https://maps.google.com/?q=${encodeURIComponent(venue.name + ', ' + venue.address)}`;
    let locationQrDataUrl = '';
    try {
      locationQrDataUrl = await QRCode.toDataURL(venueLocationUrl, { margin: 1, width: 140 });
    } catch (e) {
      console.warn('Could not generate location QR code:', e);
    }

    const validSlots = Array.isArray(booking.all_slots) ? booking.all_slots.filter(s => s.start_time && s.end_time) : [];
    const slotsToRender = validSlots.length > 1
      ? validSlots
      : [{
          start_time: booking.start_time,
          end_time: booking.end_time,
          price: booking.total_amount,
          booking_ref: booking.booking_ref
        }];

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Venue Entry Pass - ${booking.booking_ref}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .ticket-card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 2px solid #006b30; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
    .ticket-header { background: #006b30; color: #ffffff; padding: 24px; text-align: center; }
    .ticket-header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
    .ticket-header p { margin: 6px 0 0 0; font-size: 12px; font-weight: 700; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .ticket-body { padding: 24px; }
    .otp-box { background: #fffbeb; color: #92400e; text-align: center; padding: 18px; border-radius: 14px; margin: 12px 0 20px 0; border: 2px dashed #f59e0b; }
    .otp-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .otp-code { font-size: 40px; font-weight: 900; font-family: monospace; letter-spacing: 10px; margin: 8px 0; color: #b45309; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    .info-item { font-size: 13px; }
    .info-label { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 700; display: flex; align-items: center; gap: 5px; margin-bottom: 3px; letter-spacing: 0.5px; }
    .info-value { font-weight: 700; color: #0f172a; }
    .ticket-footer { background: #f1f5f9; text-align: center; padding: 16px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .no-print-bar { max-width: 600px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; }
    .btn-print { background: #006b30; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
    @media print {
      body { background: white; padding: 0; }
      .no-print { display: none !important; }
      .ticket-card { box-shadow: none; border: 2px solid #006b30; }
    }
  </style>
</head>
<body>
  <div class="no-print no-print-bar">
    <span style="font-size: 13px; color: #64748b; font-weight: 600;">Turf Official Gate Pass & Receipt</span>
    <div style="display: flex; gap: 8px;">
      <a href="/api/bookings/${booking.booking_ref}/pass.pdf" class="btn-print" style="background: #0f172a;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        Download PDF
      </a>
      <button onclick="window.print()" class="btn-print">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
        Print Pass
      </button>
    </div>
  </div>

  ${slotsToRender.map((slot, idx) => {
    const slotRef = slot.booking_ref || (idx === 0 ? booking.booking_ref : `${booking.group_ref || booking.booking_ref}-${idx + 1}`);
    const slotPrice = slot.price || Math.round((booking.total_order_amount || booking.total_amount) / slotsToRender.length);
    const slotTimingDisplay = (slot.start_time && slot.end_time)
      ? `${getTimeOfDaySvg(slot.start_time)}${WhatsAppFormatter.formatTime(slot.start_time)} – ${getTimeOfDaySvg(slot.end_time)}${WhatsAppFormatter.formatTime(slot.end_time)}`
      : 'Confirmed Match Slot';

    return `
    <div class="ticket-card" style="${idx > 0 ? 'margin-top: 32px; page-break-before: always;' : ''}">
      <div class="ticket-header">
        <h1>${venue.name}</h1>
        <p>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          OFFICIAL ENTRY PASS ${slotsToRender.length > 1 ? `&bull; PASS ${idx + 1} OF ${slotsToRender.length}` : '& PAYMENT RECEIPT'}
        </p>
      </div>

      <div class="ticket-body">
        ${booking.status === 'cancelled' || booking.status === 'refunded' ? `
        <div class="otp-box" style="background: #fef2f2; border: 2px dashed #ef4444; color: #991b1b;">
          <div class="otp-title" style="color: #b91c1c;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>RESERVATION CANCELLED — INVALID FOR ENTRY</span>
          </div>
          <div class="otp-code" style="color: #dc2626; text-decoration: line-through;">${otpCode}</div>
          <div style="font-size: 11px; font-weight: 600; color: #b91c1c;">${booking.status === 'refunded' ? `Refund of INR ${booking.refund_amount || 0} initiated.` : 'This slot is cancelled.'}</div>
        </div>
        ` : `
        <div class="otp-box">
          <div class="otp-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
            <span>4-Digit Common Gate Check-in OTP Pass</span>
          </div>
          <div class="otp-code">${otpCode}</div>
          <div style="font-size: 11px; font-weight: 600;">Show this 4-digit code to the gate manager for check-in (${slotsToRender.length > 1 ? `Valid for all ${slotsToRender.length} sessions` : 'Valid for entry'})</div>
        </div>
        `}

        <!-- Dedicated Slot Timing Box for THIS Specific Pass -->
        <div style="margin: 16px 0; border: 2px solid #006b30; border-radius: 12px; background: #f0fdf4; padding: 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.8px;">
            ${slotsToRender.length > 1 ? `PASS ${idx + 1}: RESERVED SLOT TIMING` : 'RESERVED SLOT TIMING'}
          </div>
          <div style="font-size: 20px; font-weight: 900; color: #006b30; margin: 6px 0; display: flex; align-items: center; justify-content: center; gap: 8px;">
            ${slotTimingDisplay}
          </div>
          <div style="font-size: 12px; color: #15803d; font-weight: 700;">
            ${court?.name || 'Pitch'} &bull; ${WhatsAppFormatter.formatDate(booking.booking_date)}
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
              Pass Reference
            </span>
            <span class="info-value" style="color: #006b30; font-family: monospace;">${slotRef}</span>
          </div>
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Common Group Ref
            </span>
            <span class="info-value" style="color: #006b30; font-family: monospace;">${booking.group_ref || booking.booking_ref}</span>
          </div>
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
              Reserved Pitch
            </span>
            <span class="info-value">${court?.name || 'Pitch'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              Booking Date
            </span>
            <span class="info-value">${WhatsAppFormatter.formatDate(booking.booking_date)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Customer Name
            </span>
            <span class="info-value">${customer.name}</span>
          </div>
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Mobile Phone
            </span>
            <span class="info-value">${cleanCustomerPhone}</span>
          </div>
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              This Slot Amount
            </span>
            <span class="info-value" style="font-size: 15px; color: #006b30;">₹${slotPrice} (PAID)</span>
          </div>
          <div class="info-item">
            <span class="info-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#006b30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              Total Order (${slotsToRender.length} Slots)
            </span>
            <span class="info-value" style="color: #006b30;">₹${booking.total_order_amount || booking.total_amount} (PAID)</span>
          </div>
        </div>

      <div style="margin-top: 20px; padding: 14px; background: #f8fafc; border-radius: 12px; font-size: 11px; color: #475569; border: 1px solid #e2e8f0; display: flex; gap: 16px; align-items: center;">
        ${locationQrDataUrl ? `
        <div style="text-align: center; flex-shrink: 0; background: #ffffff; padding: 6px; border-radius: 8px; border: 1px solid #cbd5e1;">
          <img src="${locationQrDataUrl}" alt="Turf Location QR Code" style="width: 82px; height: 82px; display: block;" />
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
  `;
}).join('')}
</body>
</html>`;
  }
}
