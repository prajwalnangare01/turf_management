// SMS Service for TurfFlow Backend Server
// Supports Fast2SMS (India), MSG91, Twilio, and Dev Simulation
import { store } from '../data/store.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';

export class SmsService {
  static DEFAULT_SENDER_ID = 'TRFFLW';

  /**
   * Send SMS via configured SMS Gateway or simulation
   */
  static async sendSms({ to, message, senderId, route = 'transactional', otpCode, templateId }) {
    const rawTo = (to || '').toString().trim();
    const cleanDigits = rawTo.replace(/\D/g, '').slice(-10);
    const cleanMessage = (message || '').trim();
    const activeSenderId = senderId || process.env.SMS_SENDER_ID || this.DEFAULT_SENDER_ID;
    const activeTemplateId = templateId || process.env.FAST2SMS_DLT_TEMPLATE_ID;

    if (cleanDigits.length < 10) {
      return { success: false, error: 'Recipient phone must have 10 digits' };
    }

    // 1. Fast2SMS Gateway (India)
    const fast2smsKey = process.env.FAST2SMS_API_KEY || (process.env.SMS_PROVIDER === 'fast2sms' ? process.env.SMS_API_KEY : null);
    if (fast2smsKey && !fast2smsKey.includes('your_')) {
      try {
        let payload;
        if (route === 'otp' && otpCode) {
          // Dedicated Fast2SMS OTP Route
          payload = {
            route: 'otp',
            variables_values: otpCode,
            numbers: cleanDigits
          };
        } else if (activeTemplateId) {
          // Transactional DLT Route (approved DLT Template ID + Sender ID)
          payload = {
            route: 'dlt',
            sender_id: activeSenderId,
            message: activeTemplateId,
            variables_values: cleanMessage,
            numbers: cleanDigits
          };
        } else {
          // Quick SMS Route (Direct custom transactional text)
          payload = {
            route: 'q',
            message: cleanMessage,
            language: 'english',
            flash: 0,
            numbers: cleanDigits
          };
        }

        const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            'authorization': fast2smsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.return === true) {
          console.log(`[Fast2SMS Sent via ${payload.route.toUpperCase()}] To: +91${cleanDigits} | ReqId: ${data.request_id}`);
          return { success: true, simulated: false, id: data.request_id, provider: 'fast2sms' };
        } else {
          console.warn(`[Fast2SMS Error]`, data.message);
        }
      } catch (err) {
        console.warn(`[Fast2SMS Network Error]:`, err.message);
      }
    }

    // 2. Twilio Gateway (International / US / India)
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
    if (twilioSid && twilioToken && twilioFrom && !twilioSid.includes('your_')) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const params = new URLSearchParams();
        params.append('From', twilioFrom);
        params.append('To', rawTo.startsWith('+') ? rawTo : `+91${cleanDigits}`);
        params.append('Body', cleanMessage);

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        const data = await response.json();
        if (response.ok && data.sid) {
          console.log(`[Twilio SMS Sent] To: ${data.to} | SID: ${data.sid}`);
          return { success: true, simulated: false, id: data.sid, provider: 'twilio' };
        } else {
          console.warn(`[Twilio Error]`, data.message);
        }
      } catch (err) {
        console.warn(`[Twilio Network Error]:`, err.message);
      }
    }

    // 3. Fallback / Dev Simulation Mode
    console.log(
      `\n💬 [SMS SIMULATION OUTBOUND]\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `To:       +91${cleanDigits}\n` +
      `Sender:   ${activeSenderId}\n` +
      `Route:    ${route.toUpperCase()}\n` +
      `Message:  ${cleanMessage}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    );

    return {
      success: true,
      simulated: true,
      id: `sim_sms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient: `+91${cleanDigits}`,
      provider: 'simulation'
    };
  }

  /**
   * Send Signup Verification Code SMS
   */
  static async sendSignupOtp(phone, otpCode, venueName = 'TurfFlow Arena') {
    const message = `🔐 Your ${venueName} signup verification code is ${otpCode}. Valid for 10 minutes. Do not share this code.`;
    return this.sendSms({
      to: phone,
      message,
      route: 'otp',
      otpCode
    });
  }

  /**
   * Send Password Reset OTP SMS
   */
  static async sendPasswordResetOtp(phone, otpCode, venueName = 'TurfFlow Arena') {
    const message = `🛡️ Your ${venueName} password reset code is ${otpCode}. Valid for 10 minutes. Do not share this code.`;
    return this.sendSms({
      to: phone,
      message,
      route: 'otp',
      otpCode
    });
  }

  /**
   * Send Booking Confirmation SMS with 4-Digit Gate Pass
   */
  static async sendBookingConfirmation(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const courtName = court?.name || 'Pitch';
    const otpCode = booking.booking_ref ? booking.booking_ref.slice(-4) : '0000';
    const recipientPhone = booking.customer_phone || booking?.phone || '9876543210';

    const message =
      `🎉 Booking Confirmed! Ref: ${booking.booking_ref}\n` +
      `Pitch: ${courtName} (${venue.name})\n` +
      `Date: ${WhatsAppFormatter.formatDate(booking.booking_date)} @ ${WhatsAppFormatter.formatTime(booking.start_time)} – ${WhatsAppFormatter.formatTime(booking.end_time)}\n` +
      `Gate Pass OTP: ${otpCode}\n` +
      `Paid: ₹${booking.total_amount}\n` +
      `Rubber sole turf shoes only. See you on the turf!`;

    return this.sendSms({
      to: recipientPhone,
      message,
      route: 'transactional'
    });
  }

  /**
   * Send 1-Hour Matchday Kickoff Reminder SMS
   */
  static async sendBookingReminder(booking) {
    const venue = store.getVenue();
    const court = store.getCourts().find(c => c.id === booking.court_id);
    const courtName = court?.name || 'Pitch';
    const otpCode = booking.booking_ref ? booking.booking_ref.slice(-4) : '0000';
    const recipientPhone = booking.customer_phone || booking?.phone || '9876543210';

    const message =
      `⏰ Kickoff Reminder: Your game at ${venue.name} starts in 1 hour (${booking.start_time})!\n` +
      `Court: ${courtName}\n` +
      `Gate Pass OTP: ${otpCode}\n` +
      `Address: ${venue.address}\n` +
      `Please arrive 10 mins early with turf shoes.`;

    return this.sendSms({
      to: recipientPhone,
      message,
      route: 'transactional'
    });
  }
}
