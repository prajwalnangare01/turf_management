import { Booking, Customer, Venue } from '../types/schema';
import { normalizeIndianPhone } from '../utils/venueTime';

export interface SmsDispatchResult {
  success: boolean;
  id?: string;
  simulated: boolean;
  error?: string;
  recipient: string;
  message: string;
  provider?: string;
}

export interface SendSmsPayload {
  to: string;
  message: string;
  senderId?: string;
  route?: 'otp' | 'transactional';
  otpCode?: string;
}

export class SmsService {
  private static DEFAULT_SENDER_ID = 'TRFFLW';

  /**
   * Check if any real SMS Gateway is configured
   */
  public static isSmsConfigured(): boolean {
    const env = (import.meta as any).env || {};
    const key = env.VITE_SMS_API_KEY || env.SMS_API_KEY || env.FAST2SMS_API_KEY || env.MSG91_AUTH_KEY || env.TWILIO_AUTH_TOKEN;
    return !!key && !key.includes('your_') && key !== 'mock';
  }

  /**
   * Primary SMS Dispatcher
   * Routes via local dev proxy (/api/sms/send) or direct REST API
   */
  public static async sendSms(payload: SendSmsPayload): Promise<SmsDispatchResult> {
    const rawTo = (payload.to || '').trim();
    const cleanDigits = rawTo.replace(/\D/g, '').slice(-10);
    const normalizedTo = normalizeIndianPhone(rawTo);
    const senderId = payload.senderId || this.DEFAULT_SENDER_ID;
    const cleanMessage = payload.message.trim();

    if (cleanDigits.length < 10) {
      return {
        success: false,
        recipient: rawTo,
        message: cleanMessage,
        simulated: false,
        error: 'Recipient phone number must contain at least 10 valid digits.'
      };
    }

    // 1. Try local dev server proxy /api/sms/send (Node environment, eliminates CORS)
    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: normalizedTo,
          phone10: cleanDigits,
          message: cleanMessage,
          senderId,
          route: payload.route || 'transactional',
          otpCode: payload.otpCode
        })
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          id: result.id || `sms_${Date.now()}`,
          simulated: !!result.simulated,
          recipient: normalizedTo,
          message: cleanMessage,
          provider: result.provider || 'default'
        };
      }
    } catch {
      // Fetch proxy unavailable, proceed to client fallback/simulation
    }

    // 2. Client-side fallback / simulation mode
    console.info(
      `%c[SMS Outbound Simulation]%c To: ${normalizedTo} | Sender: ${senderId}\nMessage: "${cleanMessage}"`,
      'background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
      'color: inherit;'
    );

    return {
      success: true,
      id: `sim_sms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      simulated: true,
      recipient: normalizedTo,
      message: cleanMessage,
      provider: 'simulation'
    };
  }

  /**
   * 1. Send Mobile Signup OTP SMS
   */
  public static async sendSignupOtp(phone: string, otpCode: string, venueName = 'TurfFlow Arena'): Promise<SmsDispatchResult> {
    const message = `🔐 Your ${venueName} signup verification code is ${otpCode}. Valid for 10 minutes. Please do not share this OTP.`;
    return this.sendSms({
      to: phone,
      message,
      route: 'otp',
      otpCode
    });
  }

  /**
   * 2. Send Forgot Password Reset OTP SMS
   */
  public static async sendPasswordResetOtp(phone: string, otpCode: string, venueName = 'TurfFlow Arena'): Promise<SmsDispatchResult> {
    const message = `🛡️ Your ${venueName} password reset code is ${otpCode}. Valid for 10 minutes. If you did not request this, please contact support.`;
    return this.sendSms({
      to: phone,
      message,
      route: 'otp',
      otpCode
    });
  }

  /**
   * 3. Send Booking Confirmation SMS with 4-digit Gatepass
   */
  public static async sendBookingConfirmation(params: {
    booking: Booking;
    customer?: Customer;
    courtName: string;
    venue: Venue;
  }): Promise<SmsDispatchResult> {
    const { booking, customer, courtName, venue } = params;
    const recipientPhone = customer?.phone || (booking as any).customer_phone || '9876543210';
    const otpCode = booking.booking_ref ? booking.booking_ref.slice(-4) : '0000';

    const message = 
      `🎉 Booking Confirmed! Ref: ${booking.booking_ref}\n` +
      `Pitch: ${courtName} (${venue.name})\n` +
      `Date: ${booking.booking_date} @ ${booking.start_time} - ${booking.end_time}\n` +
      `Gate Entry OTP: ${otpCode}\n` +
      `Amount Paid: ₹${booking.total_amount}\n` +
      `Please arrive 10 mins early with turf shoes. See you on the turf!`;

    return this.sendSms({
      to: recipientPhone,
      message,
      route: 'transactional'
    });
  }

  /**
   * 4. Send 1-Hour Matchday Kickoff Reminder SMS
   */
  public static async sendBookingReminder(params: {
    booking: Booking;
    customer?: Customer;
    courtName: string;
    venue: Venue;
  }): Promise<SmsDispatchResult> {
    const { booking, customer, courtName, venue } = params;
    const recipientPhone = customer?.phone || (booking as any).customer_phone || '9876543210';
    const otpCode = booking.booking_ref ? booking.booking_ref.slice(-4) : '0000';

    const message = 
      `⏰ Kickoff Reminder: Your game at ${venue.name} starts in 1 hour (${booking.start_time})!\n` +
      `Court: ${courtName}\n` +
      `Gate Entry OTP: ${otpCode}\n` +
      `Address: ${venue.address}\n` +
      `Rubber sole turf shoes only. Have a great match!`;

    return this.sendSms({
      to: recipientPhone,
      message,
      route: 'transactional'
    });
  }
}
