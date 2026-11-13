import { Booking, Customer, Court, Venue } from '../types/schema';
import { formatTimeRange12h, formatTime12hPlain, formatDateDDMMYYYY, getBookingGatePassOtp } from '../utils/formatters';
import { AuditLogger } from './auditLogger';

export interface EmailDispatchResult {
  success: boolean;
  id?: string;
  simulated: boolean;
  error?: string;
  sandboxRestricted?: boolean;
  recipient: string;
  subject: string;
  preview: string;
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded string
  contentType?: string;
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  reply_to?: string;
  attachments?: EmailAttachment[];
}

export class EmailService {
  private static DEFAULT_SENDER = 'TurfFlow Arena <rajupainter84688@gmail.com>';
  private static DEFAULT_REPLY_TO = 'rajupainter84688@gmail.com';

  /**
   * Check if Nodemailer/SMTP email service is configured
   */
  public static isConfigured(): boolean {
    const user = (import.meta as any).env?.SMTP_USER || 'rajupainter84688@gmail.com';
    return !!user && user !== 'your_email@gmail.com';
  }

  /**
   * Backward-compatibility alias
   */
  public static isResendConfigured(): boolean {
    return this.isConfigured();
  }

  /**
   * Return the primary sender/account email configured
   */
  public static getSenderEmail(): string {
    const raw = (import.meta as any).env?.SMTP_FROM_EMAIL || 
                (import.meta as any).env?.RESEND_FROM_EMAIL || 
                'rajupainter84688@gmail.com';
    const match = String(raw).match(/<([^>]+)>/);
    return (match ? match[1] : String(raw)).trim().toLowerCase();
  }

  public static getResendSenderEmail(): string {
    return this.getSenderEmail();
  }

  /**
   * Check if a given email matches the sender/account email
   */
  public static isSenderEmail(email?: string | null): boolean {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    const sender = this.getSenderEmail();
    return clean === sender;
  }

  public static isResendSenderEmail(email?: string | null): boolean {
    return this.isSenderEmail(email);
  }

  /**
   * Primary email dispatcher
   * Routes through Vite dev server middleware (/api/email/send) or backend server API
   */
  public static async sendEmail(payload: SendEmailPayload): Promise<EmailDispatchResult> {
    const fromAddress = payload.from || (import.meta as any).env?.SMTP_FROM_EMAIL || this.DEFAULT_SENDER;
    const cleanTo = payload.to.trim();
    const plainPreview = payload.text.slice(0, 160).replace(/\n+/g, ' ');

    // 1. Try dev server proxy / backend /api/email/send (Node Nodemailer environment)
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanTo,
          from: fromAddress,
          reply_to: payload.reply_to || this.DEFAULT_REPLY_TO,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          attachments: payload.attachments
        })
      });

      if (response.ok) {
        const json = await response.json();
        return {
          success: true,
          id: json.data?.id || json.id || `mail_${Date.now()}`,
          simulated: !!json.simulated,
          recipient: cleanTo,
          subject: payload.subject,
          preview: plainPreview
        };
      } else {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error || errJson?.details?.message || errJson?.message || 'SMTP delivery failed';
        return {
          success: false,
          error: errMsg,
          sandboxRestricted: false,
          simulated: false,
          recipient: cleanTo,
          subject: payload.subject,
          preview: plainPreview
        };
      }
    } catch {
      // Server endpoint not reachable (e.g. offline unit testing)
    }

    // 2. Graceful Mock / Demo Simulation fallback
    const mockId = `sim_smtp_${Math.random().toString(36).substring(2, 9)}`;
    console.info('[Nodemailer Email Simulation]', {
      id: mockId,
      to: cleanTo,
      subject: payload.subject,
      preview: plainPreview
    });

    return {
      success: true,
      id: mockId,
      simulated: true,
      recipient: cleanTo,
      subject: payload.subject,
      preview: plainPreview
    };
  }

  /**
   * 1. Send Booking Confirmation Email
   */
  public static async sendBookingConfirmation(params: {
    booking: Booking;
    customer: Customer;
    courtName: string;
    venue: Venue;
  }): Promise<EmailDispatchResult> {
    const { booking, customer, courtName, venue } = params;
    const recipient = customer.email || 'customer@example.com';
    const otpCode = getBookingGatePassOtp(booking);
    const timeRangeStr = booking.formatted_slots || formatTimeRange12h(booking.start_time, booking.end_time);
    const totalPaidAmount = booking.total_order_amount || booking.total_amount;

    const subject = `Booking Confirmed: ${booking.booking_ref} - ${venue.name}`;

    const text = [
      `TURFFLOW - BOOKING CONFIRMATION`,
      `Hi ${customer.name},`,
      `Your turf booking at ${venue.name} is confirmed!`,
      ``,
      `Booking Reference: ${booking.booking_ref}`,
      `Gate Check-in OTP: ${otpCode}`,
      `Pitch / Court: ${courtName}`,
      `Date: ${formatDateDDMMYYYY(booking.booking_date)}`,
      `Slot Time(s): ${timeRangeStr}`,
      `Total Paid: INR ${totalPaidAmount}`,
      `Venue Address: ${venue.address}`,
      ``,
      `Important Guidelines:`,
      `- Arrive 10 minutes prior to your reserved slot.`,
      `- Only turf shoes or trainers with non-marking soles are permitted. No metal studs allowed.`,
      `- Show your 4-digit OTP (${otpCode}) to the gate attendant for venue access.`,
      ``,
      `See you on the pitch!`,
      `Team ${venue.name}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <!-- Brand Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #006b30 0%, #004d22 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #86efac; margin-bottom: 6px;">TurfFlow Sports Venue</div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Booking Confirmed!</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; color: #f0fdf4;">Ref: <strong style="font-family: monospace; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px;">${booking.booking_ref}</strong></p>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 16px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${customer.name}</strong>,<br/>
          Your pitch reservation has been successfully confirmed and payment verified.
        </p>

        <!-- Prominent OTP Gate Pass Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #b45309;">4-Digit Gate Check-in Pass</div>
              <div style="font-size: 38px; font-weight: 900; font-family: monospace; letter-spacing: 10px; color: #78350f; margin: 6px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #92400e; font-weight: 600;">Present this 4-digit code at the arena gate for entrance</div>
            </td>
          </tr>
        </table>

        <!-- Reservation Details Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
          <tr style="background: #f8fafc;">
            <td colspan="2" style="padding: 12px 16px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 1px solid #e2e8f0;">
              Reservation Summary
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 40%;">Pitch / Court</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${courtName}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Date</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${formatDateDDMMYYYY(booking.booking_date)}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Slot Time</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #006b30; border-bottom: 1px solid #f1f5f9;">${timeRangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Total Paid</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 800; color: #006b30; border-bottom: 1px solid #f1f5f9;">₹${totalPaidAmount} <span style="font-size: 11px; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-weight: 700;">PAID (Razorpay)</span></td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b;">Venue Location</td>
            <td style="padding: 12px 16px; font-size: 12px; color: #334155;"><strong>${venue.name}</strong><br/>${venue.address}</td>
          </tr>
        </table>

        <!-- Venue Guidelines -->
        <div style="background: #f8fafc; border-left: 4px solid #006b30; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 800; color: #006b30; margin-bottom: 4px; text-transform: uppercase;">Matchday Rules & Entry</div>
          <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #475569; line-height: 1.6;">
            <li>Please reach the turf <strong>10 minutes before</strong> your slot start time.</li>
            <li>Only turf shoes, studs, or trainers with non-marking rubber soles are allowed. <strong>No metal spikes.</strong></li>
            <li>Water dispensers and washroom changing rooms are available on-site.</li>
          </ul>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        <p style="margin: 0 0 4px 0;">This email was sent by <strong>${venue.name}</strong> powered by TurfFlow & Nodemailer.</p>
        <p style="margin: 0;">Venue Helpline: ${venue.contact_phone} | GST: ${venue.gst_number}</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const res = await this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER
    });

    try {
      AuditLogger.log(
        'SYSTEM',
        'SEND_EMAIL_CONFIRMATION',
        'Booking',
        booking.booking_ref || booking.id,
        null,
        {
          recipient,
          customerName: customer.name,
          bookingRef: booking.booking_ref,
          slot: `${formatDateDDMMYYYY(booking.booking_date)} ${booking.start_time}-${booking.end_time}`,
          status: res.success ? 'sent' : 'failed'
        }
      );
    } catch {}

    return res;
  }

  /**
   * 2. Send Booking Cancellation Notice Email
   */
  public static async sendBookingCancellation(params: {
    booking: Booking;
    customer: Customer;
    courtName: string;
    venue: Venue;
    refundAmount: number;
    refundPercentage?: number;
    metTerms?: boolean;
    noticeHours?: number;
  }): Promise<EmailDispatchResult> {
    const { booking, customer, courtName, venue, refundAmount, refundPercentage, metTerms, noticeHours } = params;
    const recipient = customer.email || (booking as any).customer_email || 'customer@example.com';
    const timeRangeStr = formatTimeRange12h(booking.start_time, booking.end_time);

    const isCancelledByAdmin = booking.cancelled_by === 'admin';
    const isRainout = booking.refund_reason?.toLowerCase().includes('rain') || booking.refund_reason?.toLowerCase().includes('weather');
    const subject = isRainout
      ? `🌧️ Match Cancelled by Venue due to Rain: ${booking.booking_ref} — ${venue.name}`
      : isCancelledByAdmin
        ? `❌ Booking Cancelled by Venue Management: ${booking.booking_ref} — ${venue.name}`
        : (refundAmount > 0
            ? `Booking Cancelled & Refund Initiated: ${booking.booking_ref} — ${venue.name}`
            : `Booking Cancelled: ${booking.booking_ref} — ${venue.name}`);

    const text = [
      `TURFFLOW - CANCELLATION NOTICE`,
      `Hi ${customer.name},`,
      isCancelledByAdmin
        ? `Your booking ref ${booking.booking_ref} at ${venue.name} has been cancelled by venue management.`
        : `Your booking ref ${booking.booking_ref} at ${venue.name} has been cancelled.`,
      ``,
      `Court: ${courtName}`,
      `Date: ${formatDateDDMMYYYY(booking.booking_date)} (${timeRangeStr})`,
      `Total Booking Amount: INR ${booking.total_amount}`,
      booking.refund_reason ? `Cancellation Reason: ${booking.refund_reason}` : '',
      refundAmount > 0
        ? `Refund Amount Approved: INR ${refundAmount} (${refundPercentage || 100}% refund)`
        : `Refund: INR 0 (Per venue cancellation cutoff policy)`,
      refundAmount > 0
        ? `Timeline: The refund will reflect in your original payment method within 5-7 business days. A separate refund receipt has also been dispatched.`
        : ``,
      `Venue Support: ${venue.contact_phone}`,
      `Team ${venue.name}`
    ].filter(Boolean).join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #fca5a5; margin-bottom: 6px;">TurfFlow Cancellation Notice</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Reservation Cancelled</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; color: #fee2e2;">Ref: <strong style="font-family: monospace;">${booking.booking_ref}</strong></p>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155; line-height: 1.5;">
          Hi <strong>${customer.name}</strong>,<br/>
          Your reservation for <strong>${courtName}</strong> on <strong>${formatDateDDMMYYYY(booking.booking_date)} (${timeRangeStr})</strong> has been cancelled${isCancelledByAdmin ? ' by <strong>venue management</strong>' : ''}.
        </p>

        ${booking.refund_reason ? `
        <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #9f1239;">
          <strong>Cancellation Reason / Ledger Note:</strong> ${booking.refund_reason}
        </div>` : ''}

        <!-- Refund Summary Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${refundAmount > 0 ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${refundAmount > 0 ? '#86efac' : '#fecaca'}; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: ${refundAmount > 0 ? '#166534' : '#991b1b'};">
                ${refundAmount > 0 ? 'Refund Status: INITIATED' : 'Cancellation Policy Status'}
              </div>
              <div style="font-size: 34px; font-weight: 900; color: ${refundAmount > 0 ? '#15803d' : '#b91c1c'}; margin: 6px 0;">
                ₹${refundAmount}
              </div>
              <div style="font-size: 13px; color: #475569; font-weight: 600;">
                ${refundAmount > 0
                  ? `Refund of ₹${refundAmount} initiated back to your original payment method.`
                  : 'Notice period was below the cutoff threshold or zero refund applied per venue terms.'}
              </div>
              ${refundAmount > 0 ? `
              <div style="margin-top: 10px; font-size: 11px; color: #166534; background: #dcfce7; display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 700;">
                ⚡ Crediting in 5-7 business days via Razorpay (Separate refund confirmation email dispatched)
              </div>` : ''}
            </td>
          </tr>
        </table>

        <!-- Cancellation Summary Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Booking Amount</td>
            <td style="padding: 10px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">₹${booking.total_amount}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Notice Period</td>
            <td style="padding: 10px 16px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${noticeHours !== undefined ? `${noticeHours.toFixed(1)} hours before start` : 'Standard'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b;">Policy Tier Applied</td>
            <td style="padding: 10px 16px; font-size: 13px; font-weight: 700; color: ${metTerms ? '#15803d' : '#b91c1c'};">${metTerms ? 'Full / Tiered Refund Approved' : 'Non-refundable (Late cancellation)'}</td>
          </tr>
        </table>

        <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
          If you have any questions regarding your cancellation or refund status, please contact venue operations at <strong>${venue.contact_phone}</strong>.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        <p style="margin: 0;">${venue.name} &bull; ${venue.address}</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const res = await this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER
    });

    try {
      AuditLogger.log(
        'SYSTEM',
        'SEND_EMAIL_CANCELLATION',
        'Booking',
        booking.booking_ref || booking.id,
        null,
        {
          recipient,
          customerName: customer.name,
          bookingRef: booking.booking_ref,
          refundAmount,
          status: res.success ? 'sent' : 'failed'
        }
      );
    } catch {}

    return res;
  }

  /**
   * 2b. Send Dedicated Refund Confirmation Email
   */
  public static async sendRefundConfirmation(params: {
    booking: Booking;
    customer: Customer;
    courtName: string;
    venue: Venue;
    refundAmount: number;
    refundReason?: string;
    refundMode?: string;
    processedBy?: string;
  }): Promise<EmailDispatchResult> {
    const {
      booking,
      customer,
      courtName,
      venue,
      refundAmount,
      refundReason,
      refundMode = 'Original Payment Method (Razorpay UPI / Cards)',
      processedBy = 'Venue Management'
    } = params;

    const recipient = customer.email || (booking as any).customer_email || 'customer@example.com';
    const timeRangeStr = formatTimeRange12h(booking.start_time, booking.end_time);
    const subject = `💳 Refund Initiated: ₹${refundAmount.toLocaleString('en-IN')} for Booking ${booking.booking_ref} — ${venue.name}`;

    const text = [
      `TURFFLOW - PAYMENT REFUND RECEIPT`,
      `Hi ${customer.name},`,
      ``,
      `A payment refund of INR ${refundAmount.toLocaleString('en-IN')} has been initiated for your booking at ${venue.name}.`,
      ``,
      `TRANSACTION BREAKDOWN:`,
      `- Booking Reference: ${booking.booking_ref}`,
      `- Pitch / Court: ${courtName}`,
      `- Match Date & Slot: ${formatDateDDMMYYYY(booking.booking_date)} (${timeRangeStr})`,
      `- Original Amount Paid: INR ${booking.total_amount.toLocaleString('en-IN')}`,
      `- Refunded Amount: INR ${refundAmount.toLocaleString('en-IN')}`,
      `- Refund Reason / Note: ${refundReason || 'Approved by venue administration'}`,
      `- Payout Destination: ${refundMode}`,
      `- Settlement Timeline: 5 to 7 business days to reflect in your bank/UPI statement.`,
      ``,
      `For any questions or ledger assistance, please call venue operations at ${venue.contact_phone}.`,
      `Team ${venue.name}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <!-- Emerald Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #047857 0%, #065f46 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #a7f3d0; margin-bottom: 6px;">TurfFlow &bull; Payment Refund Receipt</div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">Refund Initiated</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.95; color: #ecfdf5;">Ref: <strong style="font-family: monospace; letter-spacing: 1px;">${booking.booking_ref}</strong></p>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155; line-height: 1.5;">
          Hi <strong>${customer.name}</strong>,<br/>
          A payment refund of <strong style="color: #047857;">₹${refundAmount.toLocaleString('en-IN')}</strong> has been approved and initiated for your reservation at <strong>${venue.name}</strong>.
        </p>

        <!-- Big Highlight Refund Amount Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border: 2px dashed #10b981; border-radius: 14px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 24px 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #065f46;">Approved Refund Amount</div>
              <div style="font-size: 38px; font-weight: 900; color: #047857; margin: 8px 0; letter-spacing: -1px;">
                ₹${refundAmount.toLocaleString('en-IN')}
              </div>
              <div style="display: inline-block; background: #dcfce7; border: 1px solid #86efac; color: #166534; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 999px;">
                ⚡ Status: INITIATED &bull; Reversal in Progress
              </div>
              <div style="margin-top: 10px; font-size: 12px; color: #475569; font-weight: 500;">
                Funds typically reflect in your bank account or UPI source within <strong>5–7 business days</strong>.
              </div>
            </td>
          </tr>
        </table>

        <!-- Refund Ledger Breakdown Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px; font-size: 13px;">
          <tr style="background: #f8fafc;">
            <td colspan="2" style="padding: 10px 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #475569; border-bottom: 1px solid #e2e8f0;">
              Financial Settlement Details
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 45%;">Booking Reference</td>
            <td style="padding: 10px 16px; font-weight: 700; font-family: monospace; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${booking.booking_ref}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Pitch / Court</td>
            <td style="padding: 10px 16px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${courtName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Reserved Slot</td>
            <td style="padding: 10px 16px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${formatDateDDMMYYYY(booking.booking_date)} (${timeRangeStr})</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Original Booking Total</td>
            <td style="padding: 10px 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">₹${booking.total_amount.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="background: #f0fdf4;">
            <td style="padding: 12px 16px; font-weight: 800; color: #166534; border-bottom: 1px solid #dcfce7;">Refund Issued</td>
            <td style="padding: 12px 16px; font-weight: 900; color: #047857; font-size: 15px; border-bottom: 1px solid #dcfce7;">₹${refundAmount.toLocaleString('en-IN')}</td>
          </tr>
          ${refundReason ? `
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Ledger Reason</td>
            <td style="padding: 10px 16px; font-weight: 600; color: #334155; font-style: italic; border-bottom: 1px solid #f1f5f9;">${refundReason}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Payout Channel</td>
            <td style="padding: 10px 16px; font-weight: 600; color: #334155; border-bottom: 1px solid #f1f5f9;">${refundMode}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b;">Processed By</td>
            <td style="padding: 10px 16px; font-weight: 600; color: #334155;">${processedBy}</td>
          </tr>
        </table>

        <!-- Security / Help Box -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; font-size: 12px; color: #64748b; line-height: 1.6;">
          <p style="margin: 0 0 6px 0; font-weight: 700; color: #334155;">💡 When will I see the refund?</p>
          <p style="margin: 0;">
            Depending on your issuing bank or UPI application, funds will credit to your account within <strong>5 to 7 business days</strong>. If you do not see the credit by then, please contact our support desk at <strong>${venue.contact_phone}</strong> quoting reference <strong>${booking.booking_ref}</strong>.
          </p>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        <p style="margin: 0 0 4px 0;"><strong>${venue.name}</strong> &bull; ${venue.address}</p>
        <p style="margin: 0;">Helpline: ${venue.contact_phone} &bull; Powered by Razorpay Payment Gateway</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const res = await this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER
    });

    try {
      AuditLogger.log(
        'SYSTEM',
        'SEND_EMAIL_REFUND_CONFIRMATION',
        'Booking',
        booking.booking_ref || booking.id,
        null,
        {
          recipient,
          customerName: customer.name,
          bookingRef: booking.booking_ref,
          refundAmount,
          refundReason,
          status: res.success ? 'sent' : 'failed'
        }
      );
    } catch {}

    return res;
  }

  /**
   * 3. Send Registration Welcome Email
   */
  public static async sendWelcomeEmail(params: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    venueName?: string;
  }): Promise<EmailDispatchResult> {
    const { customerName, customerEmail, customerPhone, venueName = 'TurfFlow Arena' } = params;
    const subject = `Welcome to ${venueName}! Your Player Account is Ready`;

    const text = [
      `WELCOME TO ${venueName.toUpperCase()}!`,
      `Hi ${customerName},`,
      `Your player account has been verified and registered with mobile number ${customerPhone}.`,
      ``,
      `You can now:`,
      `- Hold and reserve real-time sports pitches in 2 clicks`,
      `- Fast-track online checkouts via Razorpay Live (UPI / Cards)`,
      `- Access your 4-digit gate passes directly from your profile`,
      ``,
      `Have questions? Reply directly to this email or visit our venue desk.`,
      `See you on the pitch!`,
      `Team ${venueName}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #006b30 0%, #004d22 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #86efac; margin-bottom: 6px;">TurfFlow Arena</div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800;">Welcome, ${customerName}!</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; color: #f0fdf4;">Your player account is now active</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 16px 0; color: #334155;">
          Thank you for creating an account at <strong>${venueName}</strong>! Your account has been registered with mobile <strong>${customerPhone}</strong>.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
          <div style="font-size: 13px; font-weight: 800; color: #006b30; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
            ⚡ Quick Booking Benefits
          </div>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
            <li><strong>Instant Slot Holds:</strong> Real-time Redis 2-minute locks prevent slot clashes while you pay.</li>
            <li><strong>Digital Gate Passes:</strong> Instant 4-digit OTP pass and printable PDF tickets.</li>
            <li><strong>Hassle-Free Refunds:</strong> Clear cancellation windows with automated instant reversals.</li>
          </ul>
        </div>
      </td>
    </tr>
    <tr>
      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        ${venueName} &bull; Powered by TurfFlow Email Service
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
   * 4. Send Nodemailer SMTP Integration Test Email (from Admin Settings)
   */
  public static async sendTestEmail(toEmail: string, venueName: string = 'TurfFlow Arena'): Promise<EmailDispatchResult> {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const isLive = this.isConfigured();
    const subject = `✅ SMTP Integration Test: ${venueName} (${isLive ? 'LIVE' : 'SIMULATED'})`;

    const text = [
      `TURFFLOW NODEMAILER SMTP EMAIL INTEGRATION TEST`,
      `Status: ${isLive ? 'LIVE (Gmail SMTP Connected)' : 'SIMULATION MODE (Demo Mode)'}`,
      `Timestamp: ${timestamp}`,
      `Target Recipient: ${toEmail}`,
      ``,
      `Your Nodemailer Gmail SMTP email configuration is functional. All booking confirmations and cancellation receipts will dispatch through this channel.`,
      `Team TurfFlow`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.05);">
    <div style="display: inline-block; background: ${isLive ? '#dcfce7' : '#fef3c7'}; color: ${isLive ? '#166534' : '#92400e'}; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 999px; text-transform: uppercase; margin-bottom: 12px;">
      ${isLive ? '⚡ Live Gmail SMTP Connection' : '🧪 Simulation Mode'}
    </div>
    <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #006b30;">Nodemailer SMTP Email Test Successful</h2>
    <p style="font-size: 14px; color: #475569; margin: 0 0 16px 0;">
      Your transactional email pipeline for <strong>${venueName}</strong> is configured and operational via Nodemailer.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 12px; color: #334155;">
      <div><strong>Dispatched At:</strong> ${timestamp}</div>
      <div><strong>Recipient:</strong> ${toEmail}</div>
      <div><strong>Engine:</strong> Nodemailer SMTP (Gmail)</div>
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({
      to: toEmail,
      subject,
      html,
      text
    });
  }

  /**
   * 5. Send Login Verification OTP Email
   */
  public static async sendLoginVerificationOtp(params: {
    email: string;
    otpCode: string;
    customerName?: string;
    venueName?: string;
  }): Promise<EmailDispatchResult> {
    const { email, otpCode, customerName = 'Player', venueName = 'TurfFlow Arena' } = params;
    const subject = `🔐 ${otpCode} is your TurfFlow Login Verification Code`;

    const text = [
      `TURFFLOW - LOGIN VERIFICATION`,
      `Hi ${customerName},`,
      ``,
      `Your one-time login verification code is: ${otpCode}`,
      ``,
      `This code will expire in 10 minutes.`,
      `If you did not attempt to sign in to TurfFlow, please disregard this email.`,
      ``,
      `Team ${venueName}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #006b30 0%, #004d22 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #86efac; margin-bottom: 6px;">${venueName} Security</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Login Verification Code</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${customerName}</strong>,<br/>
          Use the 6-digit verification code below to securely log into your player account:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #166534;">Your One-Time Code</div>
              <div style="font-size: 38px; font-weight: 900; font-family: monospace; letter-spacing: 10px; color: #14532d; margin: 8px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #15803d; font-weight: 600;">Valid for 10 minutes &bull; Do not share with anyone</div>
            </td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
          If you did not request this login code, you can safely ignore this email. No access was granted without this code.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        ${venueName} &bull; Powered by TurfFlow Email Service
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text
    });
  }

  /**
   * 6. Send Email Update Verification OTP Email
   */
  public static async sendEmailUpdateVerificationOtp(params: {
    email: string;
    otpCode: string;
    customerName?: string;
    venueName?: string;
  }): Promise<EmailDispatchResult> {
    const { email, otpCode, customerName = 'Player', venueName = 'TurfFlow Arena' } = params;
    const subject = `🛡️ ${otpCode} is your TurfFlow Email Change Verification Code`;

    const text = [
      `TURFFLOW - EMAIL UPDATE VERIFICATION`,
      `Hi ${customerName},`,
      ``,
      `You requested to update your TurfFlow account email to this address.`,
      `Your verification code is: ${otpCode}`,
      ``,
      `This code will expire in 10 minutes.`,
      `If you did not request this change, please ignore this email.`,
      ``,
      `Team ${venueName}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #bae6fd; margin-bottom: 6px;">Email Verification</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Confirm New Email Address</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${customerName}</strong>,<br/>
          You requested to update your TurfFlow account email to <strong>${email}</strong>. Use the verification code below to confirm this update:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f0f9ff; border: 2px dashed #0284c7; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #0369a1;">Verification Code</div>
              <div style="font-size: 38px; font-weight: 900; font-family: monospace; letter-spacing: 10px; color: #075985; margin: 8px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #0284c7; font-weight: 600;">Valid for 10 minutes &bull; Enter in your profile to complete update</div>
            </td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
          If you did not initiate this change from your TurfFlow profile, please ignore this email. Your existing profile email will remain unchanged.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        ${venueName} &bull; Powered by TurfFlow Email Service
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text
    });
  }

  /**
   * 6b. Send Signup Email Verification OTP
   */
  public static async sendSignupVerificationOtp(params: {
    email: string;
    otpCode: string;
    customerName?: string;
    venueName?: string;
  }): Promise<EmailDispatchResult> {
    const { email, otpCode, customerName = 'Player', venueName = 'TurfFlow Arena' } = params;
    const subject = `✨ ${otpCode} is your TurfFlow Signup Verification Code`;

    const text = [
      `TURFFLOW - SIGNUP VERIFICATION`,
      `Hi ${customerName},`,
      ``,
      `Welcome to TurfFlow! Use the 6-digit code below to verify your email and activate your account:`,
      `Verification Code: ${otpCode}`,
      ``,
      `This code will expire in 10 minutes.`,
      `If you did not initiate registration at TurfFlow, please disregard this email.`,
      ``,
      `Team ${venueName}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #006b30 0%, #004d22 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #a7f3d0; margin-bottom: 6px;">New Account Registration</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Verify Your Email Address</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155;">
          Welcome to TurfFlow, <strong>${customerName}</strong>!<br/>
          Use the 6-digit verification code below to complete your player account registration:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border: 2px dashed #006b30; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #166534;">Registration Code</div>
              <div style="font-size: 38px; font-weight: 900; font-family: monospace; letter-spacing: 10px; color: #006b30; margin: 8px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #15803d; font-weight: 600;">Valid for 10 minutes &bull; Enter in the signup form to complete</div>
            </td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
          If you did not request to create an account at TurfFlow, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        ${venueName} &bull; Powered by TurfFlow Email Service
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text
    });
  }

  /**
   * 6c. Send Password Reset Verification OTP Email
   */
  public static async sendPasswordResetVerificationOtp(params: {
    email: string;
    otpCode: string;
    customerName?: string;
    venueName?: string;
  }): Promise<EmailDispatchResult> {
    const { email, otpCode, customerName = 'Player', venueName = 'TurfFlow Arena' } = params;
    const subject = `🔑 ${otpCode} is your TurfFlow Password Reset Code`;

    const text = [
      `TURFFLOW - PASSWORD RESET`,
      `Hi ${customerName},`,
      ``,
      `You requested to reset your TurfFlow account password.`,
      `Your password reset code is: ${otpCode}`,
      ``,
      `This code will expire in 10 minutes.`,
      `If you did not request a password reset, please ignore this email. Your current password remains secure.`,
      ``,
      `Team ${venueName}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #b45309 0%, #78350f 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #fde68a; margin-bottom: 6px;">Security & Password Reset</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Reset Your Account Password</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${customerName}</strong>,<br/>
          Use the 6-digit verification code below to authorize your password reset:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #92400e;">Password Reset Code</div>
              <div style="font-size: 38px; font-weight: 900; font-family: monospace; letter-spacing: 10px; color: #b45309; margin: 8px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #92400e; font-weight: 600;">Valid for 10 minutes &bull; Do not share with anyone</div>
            </td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
          If you did not request this password reset, please ignore this email. Your current password remains active and secure.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        ${venueName} &bull; Powered by TurfFlow Email Service
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html,
      text
    });
  }

  /**
   * 7. Send 1-Hour Matchday Reminder Email
   */
  public static async sendBookingReminder(params: {
    booking: Booking;
    customer: Customer;
    courtName: string;
    venue: Venue;
  }): Promise<EmailDispatchResult> {
    const { booking, customer, courtName, venue } = params;
    const recipient = customer.email || 'customer@example.com';
    const otpCode = getBookingGatePassOtp(booking);
    const timeRangeStr = formatTimeRange12h(booking.start_time, booking.end_time);

    const subject = `⏰ Kickoff in 1 Hour: ${courtName} on ${formatDateDDMMYYYY(booking.booking_date)} at ${formatTime12hPlain(booking.start_time)} (${venue.name})`;

    const text = [
      `TURFFLOW - MATCHDAY REMINDER (1 HOUR TO KICKOFF)`,
      `Hi ${customer.name},`,
      `Your game at ${venue.name} starts in approximately 1 hour!`,
      ``,
      `Court / Pitch: ${courtName}`,
      `Date: ${formatDateDDMMYYYY(booking.booking_date)}`,
      `Slot Time: ${timeRangeStr}`,
      `Booking Reference: ${booking.booking_ref}`,
      `Gate Check-in OTP: ${otpCode}`,
      `Venue Address: ${venue.address}`,
      ``,
      `Matchday Checklist:`,
      `- Arrive 10 minutes before kickoff for warm-up & check-in.`,
      `- Only turf shoes / sneakers allowed. No metal studs.`,
      `- Show your 4-digit Gate OTP (${otpCode}) to the attendant for entry.`,
      ``,
      `See you on the pitch!`,
      `Team ${venue.name}`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <!-- Alert Banner Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="display: inline-block; background: #fbbf24; color: #78350f; font-size: 11px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 14px; border-radius: 999px; margin-bottom: 10px;">
          ⏳ 1 HOUR TO KICKOFF
        </div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Matchday Reminder</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; color: #dbeafe;">
          ${venue.name} &bull; Ref: <strong style="font-family: monospace;">${booking.booking_ref}</strong>
        </p>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 16px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${customer.name}</strong>,<br/>
          Get your kit ready! Your reserved pitch slot begins in <strong>1 hour</strong>.
        </p>

        <!-- Prominent OTP Gate Pass Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #b45309;">4-Digit Gate Entry Pass</div>
              <div style="font-size: 42px; font-weight: 900; font-family: monospace; letter-spacing: 12px; color: #78350f; margin: 6px 0;">${otpCode}</div>
              <div style="font-size: 12px; color: #92400e; font-weight: 600;">Show this pass at the gate turnstile for quick check-in</div>
            </td>
          </tr>
        </table>

        <!-- Reservation Details Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
          <tr style="background: #f8fafc;">
            <td colspan="2" style="padding: 10px 16px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 1px solid #e2e8f0;">
              Match Details
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 38%;">Pitch / Court</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${courtName}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Date & Time</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #1e40af; border-bottom: 1px solid #f1f5f9;">${formatDateDDMMYYYY(booking.booking_date)} &bull; ${timeRangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b;">Venue Location</td>
            <td style="padding: 12px 16px; font-size: 12px; color: #334155;">
              <strong>${venue.name}</strong><br/>
              ${venue.address}
            </td>
          </tr>
        </table>

        <!-- Matchday Readiness Checklist -->
        <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 800; color: #1e40af; margin-bottom: 6px; text-transform: uppercase;">Kickoff Checklist</div>
          <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.6;">
            <li><strong>Arrive 10 mins early:</strong> Gives your team time to change, stretch, and check in.</li>
            <li><strong>Correct Footwear:</strong> Turf shoes or rubber studs only. Metal spikes are strictly prohibited.</li>
            <li><strong>Hydration & Locker Rooms:</strong> Purified water dispensers and lockers are ready on-site.</li>
          </ul>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        <p style="margin: 0 0 4px 0;">Sent by <strong>${venue.name}</strong> via TurfFlow Email Service.</p>
        <p style="margin: 0;">Venue Helpline: ${venue.contact_phone}</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const res = await this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER
    });

    try {
      AuditLogger.log(
        'SYSTEM',
        'SEND_EMAIL_REMINDER',
        'Booking',
        booking.booking_ref || booking.id,
        null,
        {
          recipient,
          customerName: customer.name,
          bookingRef: booking.booking_ref,
          slot: `${formatDateDDMMYYYY(booking.booking_date)} ${booking.start_time}-${booking.end_time}`,
          status: res.success ? 'sent' : 'failed'
        }
      );
    } catch {}

    return res;
  }

  /**
   * 8. Send 30-Day Monthly Data Ledger & Financial Audit Email to Turf Owner
   */
  public static async sendMonthlyDataArchiveReport(params: {
    toEmail: string;
    venue: Venue;
    periodDays?: number;
    isLastMonth?: boolean;
    monthName?: string;
    bookings: Booking[];
    summary: {
      totalBookings: number;
      grossRevenue: number;
      totalRefunds: number;
      netRevenue: number;
      confirmedCount: number;
      completedCount: number;
      cancelledCount: number;
      refundedCount: number;
      onlineCount: number;
      whatsappCount: number;
      walkinCount: number;
    };
    startDateFormatted: string;
    endDateFormatted: string;
    csvPreview?: string;
    attachments?: EmailAttachment[];
  }): Promise<EmailDispatchResult> {
    const { toEmail, venue, periodDays = 30, isLastMonth, monthName, summary, startDateFormatted, endDateFormatted } = params;
    const reportTitle = isLastMonth 
      ? `Monthly Data Archive - ${monthName || 'Previous Month'}` 
      : `Last ${periodDays} Days Data Archive & Financial Ledger`;
    const subject = `📊 ${venue.name}: ${reportTitle} (${startDateFormatted} – ${endDateFormatted})`;
    const badgeLabel = isLastMonth
      ? `📊 1ST OF MONTH BACKUP (${(monthName || 'LAST MONTH').toUpperCase()})`
      : `📊 LAST ${periodDays} DAYS DATA BACKUP`;

    const text = [
      `TURFFLOW - ${reportTitle.toUpperCase()}`,
      `Venue: ${venue.name} (GST: ${venue.gst_number})`,
      `Period: ${startDateFormatted} to ${endDateFormatted}`,
      ``,
      `FINANCIAL & BOOKING SUMMARY:`,
      `• Total Bookings: ${summary.totalBookings}`,
      `• Gross Captured Revenue: ₹${summary.grossRevenue.toLocaleString('en-IN')}`,
      `• Total Refunds Paid: ₹${summary.totalRefunds.toLocaleString('en-IN')}`,
      `• Net Retained Revenue: ₹${summary.netRevenue.toLocaleString('en-IN')}`,
      `• Active Confirmed Sessions: ${summary.confirmedCount}`,
      `• Completed Matches: ${summary.completedCount}`,
      `• Cancelled / Refunded: ${summary.cancelledCount + summary.refundedCount}`,
      ``,
      `BOOKING CHANNELS:`,
      `• Website Online: ${summary.onlineCount}`,
      `• WhatsApp Automation: ${summary.whatsappCount}`,
      `• Walk-in / Phone: ${summary.walkinCount}`,
      ``,
      `All detailed records and multi-sheet Excel files are permanently backed up and can be downloaded from your Admin Analytics tab anytime.`,
      `TurfFlow Automated Archive Service`
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #0f5132 0%, #107c41 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="display: inline-block; background: rgba(255,255,255,0.2); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 14px; border-radius: 999px; margin-bottom: 10px;">
          ${badgeLabel}
        </div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Master Ledger &amp; Revenue Audit</h1>
        <p style="margin: 8px 0 0 0; font-size: 13px; opacity: 0.9; color: #d1e7dd;">
          ${venue.name} &bull; ${startDateFormatted} to ${endDateFormatted}
        </p>
      </td>
    </tr>
        </p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 28px 24px;">
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155;">
          Hello <strong>Venue Owner</strong>,<br/>
          Attached is your scheduled <strong>30-day comprehensive data backup and financial archive</strong>. Your user-facing website maintains a lightweight 30-day window, while full audit data is compiled here.
        </p>

        <!-- KPI Grid -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
          <tr>
            <td width="50%" style="padding-right: 8px; vertical-align: top;">
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #166534;">Net Retained Revenue</div>
                <div style="font-size: 28px; font-weight: 900; color: #14532d; margin-top: 4px;">₹${summary.netRevenue.toLocaleString('en-IN')}</div>
                <div style="font-size: 11px; color: #15803d; margin-top: 2px;">Gross: ₹${summary.grossRevenue.toLocaleString('en-IN')}</div>
              </div>
            </td>
            <td width="50%" style="padding-left: 8px; vertical-align: top;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #475569;">Total Bookings</div>
                <div style="font-size: 28px; font-weight: 900; color: #0f172a; margin-top: 4px;">${summary.totalBookings}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${summary.confirmedCount + summary.completedCount} Confirmed &bull; ${summary.cancelledCount + summary.refundedCount} Cancelled</div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Summary Breakdown Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px; font-size: 13px;">
          <tr style="background: #f8fafc;">
            <td colspan="2" style="padding: 10px 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #475569; border-bottom: 1px solid #e2e8f0;">
              Executive Financial &amp; Channel Metrics
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 50%;">Gross Captured Bookings</td>
            <td style="padding: 10px 16px; font-weight: 700; color: #0f172a; text-align: right; border-bottom: 1px solid #f1f5f9;">₹${summary.grossRevenue.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Total Customer Refunds</td>
            <td style="padding: 10px 16px; font-weight: 700; color: #dc2626; text-align: right; border-bottom: 1px solid #f1f5f9;">- ₹${summary.totalRefunds.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="background: #f0fdf4;">
            <td style="padding: 12px 16px; font-weight: 800; color: #166534; border-bottom: 1px solid #dcfce7;">Net Retained Revenue</td>
            <td style="padding: 12px 16px; font-weight: 900; color: #15803d; text-align: right; font-size: 15px; border-bottom: 1px solid #dcfce7;">₹${summary.netRevenue.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Booking Channels</td>
            <td style="padding: 10px 16px; font-weight: 600; color: #334155; text-align: right; border-bottom: 1px solid #f1f5f9;">
              Website: <strong>${summary.onlineCount}</strong> &bull; WhatsApp: <strong>${summary.whatsappCount}</strong> &bull; Walk-in: <strong>${summary.walkinCount}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; color: #64748b;">GST Number / Venue ID</td>
            <td style="padding: 10px 16px; font-family: monospace; font-weight: 700; color: #334155; text-align: right;">${venue.gst_number || '29ABCDE1234F1Z5'}</td>
          </tr>
        </table>

        ${params.attachments && params.attachments.length > 0 ? `
        <!-- Attached Spreadsheet Notice -->
        <div style="background: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; padding: 14px 18px; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 800; color: #065f46;">📎 Excel File Attached: ${params.attachments[0].filename}</div>
          <div style="font-size: 11px; color: #047857; margin-top: 3px;">
            Complete multi-sheet ledger with all columns, customer names, verified contact numbers, gate OTPs, payment status, and revenue breakdown.
          </div>
        </div>
        ` : ''}

        <!-- Download & Access Note -->
        <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 16px; text-align: center;">
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">📥 On-Demand Excel &amp; CSV Downloads</div>
          <div style="font-size: 12px; color: #64748b; line-height: 1.5;">
            You can also directly download the complete multi-sheet Excel spreadsheet (.xls / .xlsx) with full customer details, OTPs, and pitch metrics at any time from your <strong>Admin Panel &gt; Reports &amp; Analytics</strong>.
          </div>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        <p style="margin: 0 0 4px 0;">Automated Backup by <strong>${venue.name}</strong>.</p>
        <p style="margin: 0;">Dispatched to Owner: ${toEmail} &bull; Contact Helpline: ${venue.contact_phone}</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: toEmail,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER,
      attachments: params.attachments
    });
  }
}
