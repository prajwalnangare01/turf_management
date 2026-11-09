// Razorpay Payment Integration & Verification
import crypto from 'crypto';

export class RazorpayService {
  /**
   * Create a simulated / live Razorpay Payment Link
   */
  static createPaymentLink({ bookingId, bookingRef, amount, customerName, customerPhone, courtName, date, startTime }) {
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_turfflow';
    const orderId = `order_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Use bookingId (e.g. bk-173...) so reference code TRF-... is not exposed in chat URLs
    const linkId = `plink_${Date.now()}`;
    const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
    const payIdentifier = bookingId || bookingRef;
    const paymentUrl = `${baseUrl}/pay/${payIdentifier}`;
    const upiIntent = `upi://pay?pa=turfflow@icici&pn=TurfFlowArena&am=${amount}&tr=${payIdentifier}&cu=INR`;

    return {
      order_id: orderId,
      payment_link_id: linkId,
      payment_url: paymentUrl,
      upi_intent: upiIntent,
      amount,
      currency: 'INR',
      expires_at: Math.floor(Date.now() / 1000) + 300 // 5 minutes
    };
  }

  /**
   * Verify HMAC-SHA256 signature from Razorpay webhook
   */
  static verifyWebhookSignature(rawBody, signature, secret) {
    if (!secret) return true; // in dev mode
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return expected === signature;
  }
}
