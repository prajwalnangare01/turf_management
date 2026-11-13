// Razorpay Payment Integration & Verification
import crypto from 'crypto';

export class RazorpayService {
  // Precision timer storage to strictly expire links when the slot lock ends
  static linkTimers = new Map();

  /**
   * Register a timer to cancel the Razorpay hosted payment link the exact moment the slot lock ends
   */
  static registerLinkExpirationTimer(paymentLinkId, bookingRef, ttlSeconds = 300) {
    if (!paymentLinkId) return;
    this.clearLinkExpirationTimer(paymentLinkId);

    const ttlMs = Math.max(1000, Number(ttlSeconds) * 1000);
    const timer = setTimeout(async () => {
      try {
        console.log(`⏱️ [Slot Lock Expired]: Cancelling Razorpay hosted payment link ${paymentLinkId} for ${bookingRef}`);
        await this.cancelPaymentLink(paymentLinkId);
      } catch (err) {
        console.warn(`Error auto-cancelling payment link ${paymentLinkId}:`, err.message);
      } finally {
        this.linkTimers.delete(paymentLinkId);
      }
    }, ttlMs);

    if (timer.unref) {
      timer.unref();
    }

    this.linkTimers.set(paymentLinkId, timer);
  }

  /**
   * Clear active expiration timer when payment is completed before hold expires
   */
  static clearLinkExpirationTimer(paymentLinkId) {
    if (!paymentLinkId) return;
    const timer = this.linkTimers.get(paymentLinkId);
    if (timer) {
      clearTimeout(timer);
      this.linkTimers.delete(paymentLinkId);
    }
  }

  /**
   * Cancel an active Razorpay Payment Link so its hosted page strictly expires and blocks late payments
   */
  static async cancelPaymentLink(paymentLinkId) {
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_TzDkSqPNwT910d';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';

    this.clearLinkExpirationTimer(paymentLinkId);

    if (!paymentLinkId || paymentLinkId.startsWith('plink_sim_') || !keyId || !keySecret || keyId.includes('xxxx')) {
      return { success: true, simulated: true, status: 'cancelled' };
    }

    try {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const res = await fetch(`https://api.razorpay.com/v1/payment_links/${paymentLinkId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok && data.status === 'cancelled') {
        console.log(`🔒 [Razorpay Payment Link Cancelled]: Hosted page is now strictly expired & blocked: ${paymentLinkId}`);
        return { success: true, data, status: 'cancelled' };
      } else {
        console.warn(`⚠️ [Razorpay Cancel Notice]: ${paymentLinkId} -`, data.error?.description || data.status || data);
        return { success: false, error: data.error?.description };
      }
    } catch (err) {
      console.warn(`⚠️ [Razorpay Cancel Error]: ${paymentLinkId} -`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Create a live/test Razorpay Payment Link via Razorpay API
   */
  static async createPaymentLinkAsync({ bookingId, bookingRef, amount, customerName, customerPhone, customerEmail, courtName, date, startTime, redirectUrl }) {
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_TzDkSqPNwT910d';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';
    const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const payIdentifier = bookingRef || bookingId;

    const fallbackPaymentUrl = `${baseUrl}/pay/${payIdentifier}`;
    const upiIntent = `upi://pay?pa=turfflow@icici&pn=TurfFlowArena&am=${amount}&tr=${payIdentifier}&cu=INR`;

    try {
      if (keyId && keySecret && !keyId.includes('xxxx')) {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rawDigits = (customerPhone || '9876543210').replace(/\D/g, '').slice(-10);
        // Ensure not all repeating digits to satisfy Razorpay validation
        const cleanDigits = (/^(.)\1+$/.test(rawDigits) || rawDigits.length < 10) ? '9876543210' : rawDigits;
        const contactFormatted = `+91${cleanDigits}`;

        const callbackUrl = redirectUrl || `${baseUrl}/api/pay/callback?ref=${payIdentifier}`;

        // Set fallback hard expiry on Razorpay cloud (minimum 16m supported by Razorpay API)
        const cloudExpireBy = Math.floor(Date.now() / 1000) + 960;

        const payload = {
          amount: Math.round(Number(amount) * 100), // paise
          currency: 'INR',
          accept_partial: false,
          expire_by: cloudExpireBy,
          description: `Turf Booking: ${courtName || 'Arena Pitch'} (${payIdentifier})`,
          customer: {
            name: customerName || 'Player',
            contact: contactFormatted,
            email: customerEmail || 'customer@turfflow.com'
          },
          notify: {
            sms: false,
            email: false,
            whatsapp: false
          },
          reminder_enable: false,
          notes: {
            booking_ref: payIdentifier,
            booking_id: bookingId || payIdentifier,
            court_name: courtName || '',
            date: date || '',
            start_time: startTime || ''
          },
          callback_url: callbackUrl,
          callback_method: 'get'
        };

        const res = await fetch('https://api.razorpay.com/v1/payment_links', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.short_url) {
          console.log(`💳 [Razorpay Payment Link Created]: ID=${data.id} -> ${data.short_url}`);

          // Register precision 5-minute (300s) timer to strictly cancel hosted page when slot lock ends
          RazorpayService.registerLinkExpirationTimer(data.id, payIdentifier, 300);

          return {
            order_id: data.order_id || `order_${Date.now()}`,
            payment_link_id: data.id,
            payment_url: data.short_url,
            raw_short_url: data.short_url,
            upi_intent: upiIntent,
            amount,
            currency: 'INR',
            expires_at: Math.floor(Date.now() / 1000) + 300
          };
        } else {
          console.warn('⚠️ Razorpay API error response:', data.error || data);
        }
      }
    } catch (err) {
      console.warn('⚠️ Error calling Razorpay API:', err.message);
    }

    const fallbackPlinkId = `plink_sim_${Date.now()}`;
    return {
      order_id: `order_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
      payment_link_id: fallbackPlinkId,
      payment_url: fallbackPaymentUrl,
      upi_intent: upiIntent,
      amount,
      currency: 'INR',
      expires_at: Math.floor(Date.now() / 1000) + 300
    };
  }

  /**
   * Create standard payment link object (synchronous)
   */
  static createPaymentLink(params) {
    const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
    const payIdentifier = params.bookingRef || params.bookingId;
    const paymentUrl = `${baseUrl}/pay/${payIdentifier}`;
    const upiIntent = `upi://pay?pa=turfflow@icici&pn=TurfFlowArena&am=${params.amount}&tr=${payIdentifier}&cu=INR`;

    return {
      order_id: `order_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
      payment_link_id: `plink_sim_${Date.now()}`,
      payment_url: paymentUrl,
      upi_intent: upiIntent,
      amount: params.amount,
      currency: 'INR',
      expires_at: Math.floor(Date.now() / 1000) + 300
    };
  }

  /**
   * Create Razorpay Standard Checkout Order via Orders API
   */
  static async createOrderAsync({ bookingRef, amount, currency = 'INR', notes = {} }) {
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_TzDkSqPNwT910d';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';

    if (keyId && keySecret && !keyId.includes('xxxx')) {
      try {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const amountPaise = Math.round(Number(amount) * 100);
        const payload = {
          amount: amountPaise,
          currency,
          receipt: (bookingRef || `rec_${Date.now()}`).slice(0, 40),
          notes: {
            booking_ref: bookingRef,
            ...notes
          }
        };

        const res = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.id) {
          console.log(`💳 [Razorpay Order Created]: Order ${data.id} for booking ${bookingRef}, amount: ₹${amount}`);
          return {
            success: true,
            order_id: data.id,
            amount: data.amount,
            currency: data.currency,
            key_id: keyId,
            receipt: data.receipt
          };
        } else {
          console.warn('⚠️ Razorpay Orders API error response:', data.error || data);
        }
      } catch (err) {
        console.warn('⚠️ Error calling Razorpay Orders API:', err.message);
      }
    }

    // Dev fallback order
    const fallbackOrderId = `order_sim_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    return {
      success: true,
      simulated: true,
      order_id: fallbackOrderId,
      amount: Math.round(Number(amount) * 100),
      currency: 'INR',
      key_id: keyId || 'rzp_test_simulated',
      receipt: bookingRef
    };
  }

  /**
   * Verify server-side payment signature from Razorpay standard checkout
   * sha256(order_id + "|" + payment_id, secret)
   */
  static verifyPaymentSignature({ orderId, paymentId, signature }) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';

    if (!orderId || !paymentId || !signature) {
      return false;
    }

    // Allow test simulated payments in development
    if (process.env.NODE_ENV !== 'production' && (orderId.startsWith('order_sim_') || paymentId.startsWith('pay_sim_') || signature === 'test_sig')) {
      return true;
    }

    if (!keySecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ RAZORPAY_KEY_SECRET is not configured in production.');
        return false;
      }
      return true;
    }

    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return expected === signature;
    }
  }

  /**
   * Verify HMAC-SHA256 signature from Razorpay webhook
   */
  static verifyWebhookSignature(rawBody, signature, secret) {
    const webhookSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ RAZORPAY_WEBHOOK_SECRET is missing in production. Rejecting webhook.');
        return false;
      }
      return true; // dev mode permissive fallback only
    }

    if (!signature) return false;

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return expected === signature;
    }
  }
  /**
   * Initiate a refund via Razorpay Refund API
   */
  static async refundPayment(paymentId, amount, notes = {}) {
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_TzDkSqPNwT910d';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';

    if (!paymentId || paymentId.startsWith('pay_sim_') || !keyId || !keySecret || keyId.includes('xxxx')) {
      return { success: true, simulated: true, refund_id: `rfnd_sim_${Date.now()}` };
    }

    try {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const payload = {
        amount: Math.round(Number(amount) * 100), // in paise
        speed: 'optimum',
        notes: notes
      };

      const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.id) {
        console.log(`💸 [Razorpay Refund Success]: Refund ${data.id} for Payment ${paymentId}, Amount: ₹${amount}`);
        return { success: true, refund_id: data.id, data };
      } else {
        console.warn('⚠️ Razorpay Refund API response:', data.error || data);
        return { success: false, error: data.error?.description || 'Refund API failed' };
      }
    } catch (err) {
      console.warn('⚠️ Error calling Razorpay Refund API:', err.message);
      return { success: false, error: err.message };
    }
  }
}
