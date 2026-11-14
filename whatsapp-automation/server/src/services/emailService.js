// Nodemailer SMTP Email Service for TurfFlow Backend Server
import nodemailer from 'nodemailer';
import { store } from '../data/store.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';

let transporterInstance = null;

function getTransporter() {
  // If explicitly requested mock email, or running on Render Free tier without FORCE_SMTP
  if (process.env.MOCK_EMAIL === 'true' || process.env.ENABLE_MOCK_EMAIL === 'true' || (process.env.RENDER && process.env.FORCE_SMTP !== 'true')) {
    return null;
  }

  const user = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.SMTP_EMAIL || 'rajupainter84688@gmail.com';
  const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || 'gbnl yhwn aowz wtbt';
  const pass = rawPass ? rawPass.replace(/\s+/g, '') : '';
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false';

  if (!pass || pass === 'your_smtp_app_password') {
    return null;
  }

  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000
    });
  }
  return transporterInstance;
}

export class EmailService {
  static DEFAULT_SENDER = 'TurfFlow Arena <rajupainter84688@gmail.com>';

  /**
   * Helper to format YYYY-MM-DD to DD/MM/YYYY
   */
  static formatDate(dateStr) {
    if (!dateStr) return '';
    const cleanStr = String(dateStr).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleanStr)) return cleanStr;
    const match = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return cleanStr;
  }

  /**
   * Helper to format 24h "18:00" to 12h "06:00 PM"
   */
  static formatTime12h(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${period}`;
  }

  /**
   * Send email using Nodemailer SMTP
   */
  static async sendEmail({ to, subject, html, text, from, reply_to, attachments }) {
    const rawSender = from || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'rajupainter84688@gmail.com';
    const senderName = process.env.SMTP_FROM_NAME || 'TurfFlow Arena';
    const fromAddress = rawSender.includes('<') ? rawSender : `"${senderName}" <${rawSender}>`;
    const replyTo = reply_to || process.env.SMTP_REPLY_TO || rawSender;
    const cleanTo = (to || '').trim();

    if (!cleanTo) {
      return { success: false, error: 'Recipient email is missing' };
    }

    const transporter = getTransporter();
    if (!transporter) {
      const demoId = `mail_${Math.random().toString(36).substring(2, 9)}`;
      console.log(`[SMTP Simulation Mode] From: ${fromAddress} | To: ${cleanTo} | Subject: "${subject}" | Attachments: ${attachments ? attachments.length : 0} | ID: ${demoId}`);
      return {
        success: true,
        simulated: true,
        id: demoId
      };
    }

    try {
      const mailOptions = {
        from: fromAddress,
        to: cleanTo,
        replyTo,
        subject,
        text,
        html
      };

      if (attachments && Array.isArray(attachments)) {
        mailOptions.attachments = attachments.map(att => ({
          filename: att.filename,
          content: typeof att.content === 'string' ? Buffer.from(att.content, 'base64') : att.content,
          contentType: att.contentType
        }));
      }

      const info = await transporter.sendMail(mailOptions);
      console.log(`✉️ [NODEMAILER OUTBOUND to ${cleanTo}] ID: ${info.messageId} | Subject: "${subject}"`);
      return {
        success: true,
        id: info.messageId,
        simulated: false
      };
    } catch (err) {
      console.warn('[Nodemailer Outbound Warning - Falling back to simulation]:', err.message);
      const fallbackId = `mail_${Math.random().toString(36).substring(2, 9)}`;
      return {
        success: true,
        id: fallbackId,
        simulated: true
      };
    }
  }

  /**
   * Send Booking Confirmation & Gate Pass Email from Server
   */
  static async sendBookingConfirmation(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const sports = store.getSports();
    const sport = sports.find(s => s.id === booking.sport_id);
    const otpCode = WhatsAppFormatter.getBookingGatePassOtp(booking);

    let customerEmail = booking.customer_email;
    if (!customerEmail && booking.customer_id) {
      const cust = store.getCustomers().find(c => c.id === booking.customer_id);
      customerEmail = cust?.email;
    }

    if (!customerEmail) {
      return { success: false, skipped: true, message: 'No email found for customer' };
    }

    const timeRangeStr = `${this.formatTime12h(booking.start_time)} - ${this.formatTime12h(booking.end_time)}`;
    const subject = `Booking Confirmed: ${booking.booking_ref} - ${venue.name}`;

    const text = [
      `TURFFLOW - BOOKING CONFIRMATION`,
      `Hi ${booking.customer_name || 'Player'},`,
      `Your pitch reservation at ${venue.name} is confirmed!`,
      ``,
      `Booking Ref: ${booking.booking_ref}`,
      `Gate Entry OTP: ${otpCode}`,
      `Court: ${court?.name || 'Main Pitch'} (${sport?.name || 'Football'})`,
      `Date: ${this.formatDate(booking.booking_date)}`,
      `Time: ${timeRangeStr}`,
      `Total Paid: INR ${booking.total_amount}`,
      `Address: ${venue.address}`,
      ``,
      `Show your 4-digit OTP (${otpCode}) at the gate turnstile for venue access.`,
      `Team ${venue.name}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #006b30 0%, #004d22 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #86efac; margin-bottom: 6px;">TurfFlow Sports Venue</div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800;">Booking Confirmed!</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; color: #f0fdf4;">Ref: <strong style="font-family: monospace;">${booking.booking_ref}</strong></p>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${booking.customer_name || 'Player'}</strong>,<br/>
          Your pitch reservation has been successfully confirmed and payment verified.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #b45309;">4-Digit Gate Entry Pass</div>
              <div style="font-size: 40px; font-weight: 900; font-family: monospace; letter-spacing: 12px; color: #78350f; margin: 6px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #92400e; font-weight: 600;">Present this 4-digit code at the arena gate for entrance</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 40%;">Pitch / Court</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${court?.name || 'Main Pitch'}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Date & Time</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #006b30; border-bottom: 1px solid #f1f5f9;">${this.formatDate(booking.booking_date)} &bull; ${timeRangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Total Paid</td>
            <td style="padding: 12px 16px; font-size: 14px; font-weight: 800; color: #006b30; border-bottom: 1px solid #f1f5f9;">₹${booking.total_amount} <span style="font-size: 10px; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px;">PAID</span></td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b;">Venue Location</td>
            <td style="padding: 12px 16px; font-size: 12px; color: #334155;"><strong>${venue.name}</strong><br/>${venue.address}</td>
          </tr>
        </table>
        <div style="background: #f8fafc; border-left: 4px solid #006b30; padding: 14px 16px; border-radius: 0 8px 8px 0;">
          <div style="font-size: 12px; font-weight: 800; color: #006b30; margin-bottom: 4px; text-transform: uppercase;">Matchday Rules</div>
          <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #475569; line-height: 1.6;">
            <li>Please arrive 10 minutes before slot time.</li>
            <li>Turf shoes or trainers with rubber soles only. No metal spikes.</li>
          </ul>
        </div>
      </td>
    </tr>
    <tr>
      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        ${venue.name} &bull; Powered by Nodemailer Email Service
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: customerEmail,
      subject,
      html,
      text
    });
  }

  /**
   * Send 1-Hour Matchday Reminder Email from Server
   */
  static async sendBookingReminder(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const otpCode = WhatsAppFormatter.getBookingGatePassOtp(booking);

    let customerEmail = booking.customer_email;
    let customerName = booking.customer_name || 'Player';
    if (!customerEmail && booking.customer_id) {
      const cust = store.getCustomers().find(c => c.id === booking.customer_id);
      customerEmail = cust?.email;
      if (cust?.name) customerName = cust.name;
    }

    if (!customerEmail) {
      return { success: false, skipped: true, message: 'No email found for customer' };
    }

    const timeRangeStr = `${this.formatTime12h(booking.start_time)} - ${this.formatTime12h(booking.end_time)}`;
    const subject = `⏰ Kickoff in 1 Hour: ${court?.name || 'Pitch'} on ${this.formatDate(booking.booking_date)} at ${this.formatTime12h(booking.start_time)} (${venue.name})`;

    const text = [
      `TURFFLOW - MATCHDAY REMINDER (1 HOUR TO KICKOFF)`,
      `Hi ${customerName},`,
      `Your pitch slot at ${venue.name} starts in 1 hour!`,
      ``,
      `Court: ${court?.name || 'Main Pitch'}`,
      `Date: ${this.formatDate(booking.booking_date)} (${timeRangeStr})`,
      `Gate OTP Pass: ${otpCode}`,
      `Address: ${venue.address}`,
      ``,
      `Matchday Checklist:`,
      `- Arrive 10 minutes early.`,
      `- Rubber turf shoes only (no metal studs).`,
      `- Show your 4-digit OTP (${otpCode}) at the gate.`,
      ``,
      `See you on the pitch!`,
      `Team ${venue.name}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="display: inline-block; background: #fbbf24; color: #78350f; font-size: 11px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 14px; border-radius: 999px; margin-bottom: 10px;">
          ⏳ 1 HOUR TO KICKOFF
        </div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800;">Matchday Reminder</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; color: #dbeafe;">${venue.name} &bull; Ref: <strong style="font-family: monospace;">${booking.booking_ref}</strong></p>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 16px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${customerName}</strong>,<br/>
          Get ready! Your reserved pitch slot begins in <strong>1 hour</strong>.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #b45309;">4-Digit Gate Entry Pass</div>
              <div style="font-size: 42px; font-weight: 900; font-family: monospace; letter-spacing: 12px; color: #78350f; margin: 6px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #92400e; font-weight: 600;">Show this pass at the gate turnstile for entrance</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 38%;">Pitch / Court</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${court?.name || 'Main Pitch'}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Date & Time</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #1e40af; border-bottom: 1px solid #f1f5f9;">${this.formatDate(booking.booking_date)} &bull; ${timeRangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b;">Venue Location</td>
            <td style="padding: 12px 16px; font-size: 12px; color: #334155;"><strong>${venue.name}</strong><br/>${venue.address}</td>
          </tr>
        </table>
        <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 0 8px 8px 0;">
          <div style="font-size: 12px; font-weight: 800; color: #1e40af; margin-bottom: 6px; text-transform: uppercase;">Kickoff Checklist</div>
          <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.6;">
            <li>Arrive 10 mins early for check-in and warm-up.</li>
            <li>Rubber turf shoes or sneakers only. No metal studs.</li>
            <li>Drinking water stations and lockers available on-site.</li>
          </ul>
        </div>
      </td>
    </tr>
    <tr>
      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        ${venue.name} &bull; Powered by Nodemailer Email Service
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: customerEmail,
      subject,
      html,
      text
    });
  }
}
