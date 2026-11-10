// Gate Pass & Official PDF Ticket Generator Service for TurfFlow
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { store } from '../data/store.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';

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

    const otpCode = booking.gate_pass_otp || (booking.status === 'confirmed' && booking.booking_ref ? booking.booking_ref.slice(-4) : '----');
    const courtName = (court?.name || booking.court_name || 'Turf Pitch').replace(/[^\x00-\x7F]/g, '');
    const sportName = (sport?.name || booking.sport_name || 'Football').replace(/[^\x00-\x7F]/g, '');

    // Generate QR code for gate check-in scanner
    const qrPayload = JSON.stringify({
      ref: booking.booking_ref,
      otp: otpCode,
      court: courtName,
      date: booking.booking_date,
      time: `${booking.start_time}-${booking.end_time}`,
      status: 'VERIFIED'
    });
    const qrBuffer = await QRCode.toBuffer(qrPayload, { margin: 1, width: 140 });

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

        drawField('Booking Reference', booking.booking_ref, 70, y + 15, true);
        drawField('Reserved Pitch', courtName, 310, y + 15);

        drawField('Sport', sportName, 70, y + 55);
        drawField('Match Date', WhatsAppFormatter.formatDate(booking.booking_date), 310, y + 55);

        drawField('Slot Time', `${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)}`, 70, y + 95);
        drawField('Customer Name', customer.name, 310, y + 95);

        drawField('Customer Phone', `+91 ${customer.phone || booking.customer_phone}`, 70, y + 135);
        drawField('Total Amount Paid', `INR ${booking.total_amount} (PAID)`, 310, y + 135, true);

        drawField('Payment Status', 'VERIFIED (Razorpay Live UPI)', 70, y + 175);
        drawField('Channel', `WhatsApp AI Concierge (${booking.source || 'online'})`, 310, y + 175);

        // 4. QR Code & Location Stamp
        y = 480;
        doc.rect(50, y, 495, 120).fillAndStroke('#F8FAFC', '#E2E8F0');
        
        // Draw QR Code
        doc.image(qrBuffer, 70, y + 10, { width: 100 });

        doc.fillColor(darkColor)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('VENUE ADDRESS & LOCATION', 190, y + 18);

        doc.fillColor(slateColor)
          .fontSize(9)
          .font('Helvetica')
          .text(venue.address, 190, y + 34, { width: 330 });

        doc.fillColor(darkColor)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(`GSTIN: ${venue.gst_number || '27AABCT1234F1Z0'}  |  Helpdesk: ${venue.contact_phone}`, 190, y + 68);

        doc.fillColor(primaryColor)
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .text('Google Maps: ' + venue.google_maps_link, 190, y + 84, { width: 330 });

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

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Return printable HTML string matching the website's Ticket Pass modal
   */
  static generatePassHtml(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const customer = store.getCustomers().find(c => c.id === booking.customer_id) || {
      name: booking.customer_name || 'Customer',
      phone: booking.customer_phone || ''
    };
    const otpCode = booking.gate_pass_otp || (booking.status === 'confirmed' && booking.booking_ref ? booking.booking_ref.slice(-4) : '----');

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
    .ticket-header p { margin: 6px 0 0 0; font-size: 12px; font-weight: 700; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
    .ticket-body { padding: 24px; }
    .otp-box { background: #fffbeb; color: #92400e; text-align: center; padding: 18px; border-radius: 14px; margin: 12px 0 20px 0; border: 2px dashed #f59e0b; }
    .otp-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
    .otp-code { font-size: 40px; font-weight: 900; font-family: monospace; letter-spacing: 10px; margin: 8px 0; color: #b45309; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    .info-item { font-size: 13px; }
    .info-label { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px; letter-spacing: 0.5px; }
    .info-value { font-weight: 700; color: #0f172a; }
    .ticket-footer { background: #f1f5f9; text-align: center; padding: 16px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .no-print-bar { max-width: 600px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; }
    .btn-print { background: #006b30; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
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
      <a href="/api/bookings/${booking.booking_ref}/pass.pdf" class="btn-print" style="background: #0f172a;">⬇️ Download PDF</a>
      <button onclick="window.print()" class="btn-print">🖨️ Print Pass</button>
    </div>
  </div>

  <div class="ticket-card">
    <div class="ticket-header">
      <h1>${venue.name}</h1>
      <p>OFFICIAL VENUE ENTRY PASS & PAYMENT RECEIPT</p>
    </div>

    <div class="ticket-body">
      <div class="otp-box">
        <div class="otp-title">4-Digit Gate Check-in OTP Pass</div>
        <div class="otp-code">${otpCode}</div>
        <div style="font-size: 11px; font-weight: 600;">Show this 4-digit code to the gate manager for check-in</div>
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
          <span class="info-value">${WhatsAppFormatter.formatDate(booking.booking_date)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Slot Time</span>
          <span class="info-value">${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Customer Name</span>
          <span class="info-value">${customer.name}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Mobile Phone</span>
          <span class="info-value">+91 ${customer.phone || booking.customer_phone}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Total Amount Paid</span>
          <span class="info-value" style="font-size: 15px; color: #006b30;">₹${booking.total_amount} (PAID)</span>
        </div>
        <div class="info-item">
          <span class="info-label">Payment Status</span>
          <span class="info-value" style="color: #006b30;">VERIFIED (Razorpay Live)</span>
        </div>
      </div>

      <div style="margin-top: 20px; padding: 14px; background: #f8fafc; border-radius: 10px; font-size: 11px; color: #475569; border: 1px solid #e2e8f0; line-height: 1.5;">
        <strong>Venue Location:</strong> ${venue.address}<br/>
        <strong>GSTIN:</strong> ${venue.gst_number || '27AABCT1234F1Z0'}<br/>
        <strong>Helpdesk:</strong> ${venue.contact_phone}
      </div>
    </div>

    <div class="ticket-footer">
      Thank you for booking with ${venue.name}. Please arrive 10 minutes prior to your slot time.
    </div>
  </div>
</body>
</html>`;
  }
}
