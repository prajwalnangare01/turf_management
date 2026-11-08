import { Booking, Customer, Court, Venue } from '../types/schema';
import { formatTimeRange12h } from '../utils/formatters';

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

export interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

export class EmailService {
  private static DEFAULT_SENDER = 'TurfFlow Arena <onboarding@resend.dev>';

  /**
   * Check if Resend is configured with a real API key
   */
  public static isResendConfigured(): boolean {
    const key = (import.meta as any).env?.VITE_RESEND_API_KEY || (import.meta as any).env?.RESEND_API_KEY;
    return !!key && key.startsWith('re_') && key !== 're_your_resend_api_key';
  }

  /**
   * Primary email dispatcher
   * Routes through Vite dev server middleware (/api/email/send) or direct Resend REST API
   */
  public static async sendEmail(payload: SendEmailPayload): Promise<EmailDispatchResult> {
    const fromAddress = payload.from || this.DEFAULT_SENDER;
    const cleanTo = payload.to.trim();
    const plainPreview = payload.text.slice(0, 160).replace(/\n+/g, ' ');

    // 1. Try local dev server proxy /api/email/send (Node environment, eliminates CORS)
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanTo,
          from: fromAddress,
          subject: payload.subject,
          html: payload.html,
          text: payload.text
        })
      });

      if (response.ok) {
        const json = await response.json();
        return {
          success: true,
          id: json.data?.id || json.id || `resend_${Date.now()}`,
          simulated: !!json.simulated,
          recipient: cleanTo,
          subject: payload.subject,
          preview: plainPreview
        };
      } else {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error || errJson?.details?.message || errJson?.message || 'Resend delivery failed';
        const isSandbox = errMsg.includes('only send testing emails') || errMsg.includes('verify your domain');
        return {
          success: false,
          error: errMsg,
          sandboxRestricted: isSandbox,
          simulated: false,
          recipient: cleanTo,
          subject: payload.subject,
          preview: plainPreview
        };
      }
    } catch {
      // Dev server middleware not reachable (e.g. static production deployment)
    }

    // 2. Direct client-side Resend API call (if client key is set)
    const apiKey = (import.meta as any).env?.VITE_RESEND_API_KEY || (import.meta as any).env?.RESEND_API_KEY;
    if (apiKey && apiKey.startsWith('re_') && apiKey !== 're_your_resend_api_key') {
      try {
        const directRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [cleanTo],
            subject: payload.subject,
            html: payload.html,
            text: payload.text
          })
        });

        if (directRes.ok) {
          const directData = await directRes.json();
          return {
            success: true,
            id: directData.id,
            simulated: false,
            recipient: cleanTo,
            subject: payload.subject,
            preview: plainPreview
          };
        } else {
          const directErr = await directRes.json().catch(() => ({}));
          const errMsg = directErr?.message || 'Resend API call rejected';
          return {
            success: false,
            error: errMsg,
            sandboxRestricted: errMsg.includes('only send testing emails') || errMsg.includes('verify your domain'),
            simulated: false,
            recipient: cleanTo,
            subject: payload.subject,
            preview: plainPreview
          };
        }
      } catch {
        // Fall through to simulation if CORS or network blocked
      }
    }

    // 3. Graceful Mock / Demo Simulation fallback
    const mockId = `sim_resend_${Math.random().toString(36).substring(2, 9)}`;
    console.info('[Resend Email Simulation]', {
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
    const otpCode = (booking.booking_ref || booking.id || '').slice(-4) || '----';
    const timeRangeStr = formatTimeRange12h(booking.start_time, booking.end_time);

    const subject = `Booking Confirmed: ${booking.booking_ref} - ${venue.name}`;

    const text = [
      `TURFFLOW - BOOKING CONFIRMATION`,
      `Hi ${customer.name},`,
      `Your turf booking at ${venue.name} is confirmed!`,
      ``,
      `Booking Reference: ${booking.booking_ref}`,
      `Gate Check-in OTP: ${otpCode}`,
      `Pitch / Court: ${courtName}`,
      `Date: ${booking.booking_date}`,
      `Slot Time: ${timeRangeStr}`,
      `Total Paid: INR ${booking.total_amount}`,
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
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${booking.booking_date}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Slot Time</td>
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #006b30; border-bottom: 1px solid #f1f5f9;">${timeRangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Total Paid</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 800; color: #006b30; border-bottom: 1px solid #f1f5f9;">₹${booking.total_amount} <span style="font-size: 11px; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-weight: 700;">PAID (Razorpay)</span></td>
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
        <p style="margin: 0 0 4px 0;">This email was sent by <strong>${venue.name}</strong> powered by TurfFlow & Resend API.</p>
        <p style="margin: 0;">Venue Helpline: ${venue.contact_phone} | GST: ${venue.gst_number}</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER
    });
  }

  /**
   * 2. Send Booking Cancellation & Refund Receipt Email
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
    const recipient = customer.email || 'customer@example.com';
    const timeRangeStr = formatTimeRange12h(booking.start_time, booking.end_time);
    const subject = refundAmount > 0
      ? `Booking Cancelled & Refund Initiated: ${booking.booking_ref}`
      : `Booking Cancelled: ${booking.booking_ref}`;

    const text = [
      `TURFFLOW - CANCELLATION & REFUND NOTICE`,
      `Hi ${customer.name},`,
      `Your booking ref ${booking.booking_ref} at ${venue.name} has been cancelled.`,
      ``,
      `Court: ${courtName}`,
      `Date: ${booking.booking_date} (${timeRangeStr})`,
      `Total Booking Amount: INR ${booking.total_amount}`,
      refundAmount > 0
        ? `Refund Amount Approved: INR ${refundAmount} (${refundPercentage || 100}% refund)`
        : `Refund: INR 0 (Per venue cancellation cutoff policy)`,
      refundAmount > 0
        ? `Timeline: The refund will reflect in your original payment method within 5-7 business days.`
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
        <p style="font-size: 15px; margin: 0 0 20px 0; color: #334155;">
          Hi <strong>${customer.name}</strong>,<br/>
          Your reservation for <strong>${courtName}</strong> on <strong>${booking.booking_date} (${timeRangeStr})</strong> has been cancelled.
        </p>

        <!-- Refund Card -->
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
                  : 'Notice period was below the cutoff threshold; no refund is due per venue policy.'}
              </div>
              ${refundAmount > 0 ? `
              <div style="margin-top: 10px; font-size: 11px; color: #166534; background: #dcfce7; display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 700;">
                ⚡ Crediting in 5-7 business days via Razorpay
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

    return this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER
    });
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
        ${venueName} &bull; Powered by Resend API
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
   * 4. Send Resend Integration Test Email (from Admin Settings)
   */
  public static async sendTestEmail(toEmail: string, venueName: string = 'TurfFlow Arena'): Promise<EmailDispatchResult> {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const isLive = this.isResendConfigured();
    const subject = `✅ Resend Integration Test: ${venueName} (${isLive ? 'LIVE' : 'SIMULATED'})`;

    const text = [
      `TURFFLOW RESEND EMAIL INTEGRATION TEST`,
      `Status: ${isLive ? 'LIVE (Resend API Connected)' : 'SIMULATION MODE (Demo Key)'}`,
      `Timestamp: ${timestamp}`,
      `Target Recipient: ${toEmail}`,
      ``,
      `Your Resend email configuration is functional. All booking confirmations and cancellation receipts will dispatch through this channel.`,
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
      ${isLive ? '⚡ Live Resend API Connection' : '🧪 Simulation Mode'}
    </div>
    <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #006b30;">Resend Email Test Successful</h2>
    <p style="font-size: 14px; color: #475569; margin: 0 0 16px 0;">
      Your transactional email pipeline for <strong>${venueName}</strong> is configured and operational.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 12px; color: #334155;">
      <div><strong>Dispatched At:</strong> ${timestamp}</div>
      <div><strong>Recipient:</strong> ${toEmail}</div>
      <div><strong>Engine:</strong> Resend Email REST API</div>
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
        ${venueName} &bull; Powered by Resend Email Delivery
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
        ${venueName} &bull; Powered by Resend Email Delivery
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
    const otpCode = (booking.booking_ref || booking.id || '').slice(-4) || '----';
    const timeRangeStr = formatTimeRange12h(booking.start_time, booking.end_time);

    const subject = `⏰ Kickoff in 1 Hour: ${courtName} at ${booking.start_time} (${venue.name})`;

    const text = [
      `TURFFLOW - MATCHDAY REMINDER (1 HOUR TO KICKOFF)`,
      `Hi ${customer.name},`,
      `Your game at ${venue.name} starts in approximately 1 hour!`,
      ``,
      `Court / Pitch: ${courtName}`,
      `Date: ${booking.booking_date}`,
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
            <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #1e40af; border-bottom: 1px solid #f1f5f9;">${booking.booking_date} &bull; ${timeRangeStr}</td>
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
        <p style="margin: 0 0 4px 0;">Sent by <strong>${venue.name}</strong> via Resend API.</p>
        <p style="margin: 0;">Venue Helpline: ${venue.contact_phone}</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
      from: venue.email_sender || this.DEFAULT_SENDER
    });
  }
}
