// Webhook Routes for Razorpay and WhatsApp Cloud API
import express from 'express';
import { RazorpayService } from '../services/razorpayService.js';
import { BookingService } from '../services/bookingService.js';
import { AiAgentService } from '../services/aiAgentService.js';
import { NotificationService } from '../services/notificationService.js';

export const webhookRouter = express.Router();

// CC-A04: Inbound Message Debounce Buffer Map (phone -> { timer, fragments, senderName })
export const inboundMessageBuffer = new Map();

export function bufferInboundMessage(fromPhone, senderName, messageText, onCombinedReady, debounceMs = 2500) {
  const existing = inboundMessageBuffer.get(fromPhone);
  if (existing) {
    clearTimeout(existing.timer);
    existing.fragments.push(messageText);
    existing.senderName = senderName || existing.senderName;
  } else {
    inboundMessageBuffer.set(fromPhone, {
      fragments: [messageText],
      senderName,
      timer: null
    });
  }

  const current = inboundMessageBuffer.get(fromPhone);
  current.timer = setTimeout(async () => {
    const combinedText = current.fragments.join(' ').trim();
    const finalSender = current.senderName;
    inboundMessageBuffer.delete(fromPhone);
    console.log(`⏱️ [DEBOUNCE FLUSH (${fromPhone})]: Combined ${current.fragments.length} message fragments -> "${combinedText}"`);
    await onCombinedReady(fromPhone, finalSender, combinedText);
  }, debounceMs);
}

/**
 * 1. Razorpay Webhook Receiver
 * Listens for 'payment.captured' or 'order.paid'
 */
webhookRouter.post('/razorpay', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify signature
    const isValid = RazorpayService.verifyWebhookSignature(req.body.toString(), signature, secret);
    if (!isValid) {
      console.warn('⚠️ Razorpay webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload.event;
    console.log(`🔔 [RAZORPAY WEBHOOK]: Received event '${event}'`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      const notes = paymentEntity?.notes || {};
      const bookingRef = notes.booking_ref;

      if (bookingRef) {
        BookingService.confirmBooking(bookingRef, paymentId);
      } else {
        console.log(`Payment captured: ${paymentId} for order ${orderId}`);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Error processing Razorpay webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Meta WhatsApp Cloud API Webhook Verification (GET)
 * Meta checks hub.verify_token and expects hub.challenge returned
 */
webhookRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'turfflow_secret_token_123';

  if (mode && token) {
    if (mode === 'subscribe' && token === expectedToken) {
      console.log('✅ WhatsApp Webhook verified by Meta Graph API');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden verification token');
  }
  res.status(400).send('Bad request');
});

/**
 * 3. Meta WhatsApp Cloud API Inbound Messages (POST)
 * Receives incoming customer messages from Meta Graph API v21.0
 */
webhookRouter.post('/whatsapp', express.json(), async (req, res) => {
  try {
    const body = req.body;

    // Check if WhatsApp message payload
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0]?.value;
      const message = changes?.messages?.[0];
      const contact = changes?.contacts?.[0];

      if (message) {
        const fromPhone = message.from; // e.g. "919876543210"
        const senderName = contact?.profile?.name || 'Customer';
        let messageText = '';

        if (message.type === 'text') {
          messageText = message.text.body;
        } else if (message.type === 'interactive') {
          // Button reply or list reply
          messageText = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
        }

        console.log(`📨 [WHATSAPP WEBHOOK RECEIVED]: From +${fromPhone} (${senderName}): "${messageText}"`);

        // CC-A04: Debounce fragmented rapid-fire incoming messages
        bufferInboundMessage(`+${fromPhone}`, senderName, messageText, async (phone, name, fullText) => {
          const agentResponse = await AiAgentService.handleIncomingMessage({
            fromPhone: phone,
            senderName: name,
            messageText: fullText
          });

          // If Meta Cloud API token is configured, send the reply back to Meta API
          if (process.env.WHATSAPP_API_KEY && process.env.WHATSAPP_PHONE_NUMBER_ID) {
            // Outbound dispatch to Meta Graph API
            // https://graph.facebook.com/v21.0/{phone-number-id}/messages
          } else {
            // In local / development mode, log outbound message
            NotificationService.sendWhatsAppMessage(phone, agentResponse.reply);
          }
        });
      }

      return res.status(200).send('EVENT_RECEIVED');
    }

    res.sendStatus(404);
  } catch (err) {
    console.error('Error handling WhatsApp webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Cron trigger for CC-A05: Abandoned checkout hold recovery (Minute 6 Nudge)
 */
webhookRouter.get('/cron/check-abandoned-holds', (req, res) => {
  const nudges = BookingService.checkExpiredHoldsAndNudge();
  res.json({ status: 'ok', nudges_sent: nudges.length, nudges });
});
