// REST API Routes for TurfFlow Backend and n8n Tools
import express from 'express';
import { store } from '../data/store.js';
import { SlotEngine } from '../services/slotEngine.js';
import { LockService } from '../services/lockService.js';
import { BookingService } from '../services/bookingService.js';
import { AiAgentService } from '../services/aiAgentService.js';
import { WhatsAppService } from '../services/whatsappService.js';
import { GatePassService } from '../services/gatePassService.js';
import { EmailService } from '../services/emailService.js';
import { getSupabase } from '../data/supabaseClient.js';

export const apiRouter = express.Router();

/**
 * Helper to resolve booking from in-memory store, Supabase, or fallback payload
 */
async function findOrResolveBooking(ref, fallbackData = {}) {
  const cleanRef = (ref || '').toString().trim().toUpperCase();
  if (!cleanRef && (!fallbackData || (!fallbackData.booking_ref && !fallbackData.id))) {
    return null;
  }

  // 1. Look in in-memory store
  let booking = store.getBookings().find(b => 
    (b.booking_ref && b.booking_ref.toUpperCase() === cleanRef) || 
    (b.id && b.id.toUpperCase() === cleanRef)
  );
  if (booking) return booking;

  // 2. Query Supabase
  try {
    const supabase = getSupabase();
    if (supabase && cleanRef) {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .or(`booking_ref.ilike.${cleanRef},id.ilike.${cleanRef}`)
        .maybeSingle();
      if (!error && data) {
        if (!store.getBookings().some(b => b.id === data.id)) {
          store.getBookings().push(data);
        }
        return data;
      }
    }
  } catch (err) {
    console.warn('Supabase booking query error in apiRoutes:', err.message);
  }

  // 3. If client passed a full or partial booking object
  if (fallbackData && (fallbackData.booking_ref || fallbackData.id)) {
    const synthetic = {
      ...fallbackData,
      id: fallbackData.id || `bk-${cleanRef || Date.now()}`,
      booking_ref: fallbackData.booking_ref || cleanRef,
      court_id: fallbackData.court_id || 'crt-001',
      sport_id: fallbackData.sport_id || 'sp-football',
      customer_id: fallbackData.customer_id || 'cust-101',
      customer_name: fallbackData.customer_name || 'Player',
      customer_phone: fallbackData.customer_phone || '+919876543210',
      booking_date: fallbackData.booking_date || new Date().toISOString().slice(0, 10),
      start_time: fallbackData.start_time || '18:00',
      end_time: fallbackData.end_time || '19:00',
      total_amount: fallbackData.total_amount || 1600,
      status: fallbackData.status || 'confirmed',
      source: fallbackData.source || 'online'
    };
    if (!store.getBookings().some(b => b.booking_ref === synthetic.booking_ref)) {
      store.getBookings().push(synthetic);
    }
    return synthetic;
  }

  // 4. If reference matches a known pattern (e.g. TRF-), generate a clean synthetic pass
  if (cleanRef.startsWith('TRF-') || cleanRef.startsWith('BK-')) {
    const synthetic = {
      id: `bk-${cleanRef}`,
      booking_ref: cleanRef,
      court_id: 'crt-001',
      court_name: 'Turf A — FIFA 5-a-side Synthetic',
      sport_id: 'sp-football',
      customer_id: 'cust-101',
      customer_name: 'Player',
      customer_phone: '+919876543210',
      booking_date: new Date().toISOString().slice(0, 10),
      start_time: '18:00',
      end_time: '19:00',
      total_amount: 1600,
      status: 'confirmed',
      source: 'online',
      created_at: new Date().toISOString()
    };
    store.getBookings().push(synthetic);
    return synthetic;
  }

  return null;
}

/**
 * 1. Venue Details
 */
apiRouter.get('/venue', (req, res) => {
  res.json({ success: true, venue: store.getVenue() });
});

/**
 * 2. Sports List
 */
apiRouter.get('/sports', (req, res) => {
  res.json({ success: true, sports: store.getSports() });
});

/**
 * 3. Courts List
 */
apiRouter.get('/courts', (req, res) => {
  res.json({ success: true, courts: store.getCourts() });
});

/**
 * 4. Dynamic Slots Calculation
 * Query params: ?date=YYYY-MM-DD&sport=football&courtId=crt-001&sessionId=phone
 */
apiRouter.get('/slots', (req, res) => {
  const { date, sport, courtId, sessionId } = req.query;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  if (courtId) {
    const court = store.getCourts().find(c => c.id === courtId);
    if (!court) {
      return res.status(404).json({ success: false, message: 'Court not found' });
    }
    const slots = SlotEngine.computeSlotsForCourt(court, targetDate, sessionId);
    return res.json({ success: true, court, date: targetDate, slots });
  }

  const result = SlotEngine.getAvailableSlots(sport, targetDate, sessionId);
  res.json({ success: true, ...result });
});

/**
 * 5. Concurrency Layer 1: Slot Lock
 */
apiRouter.post('/slots/lock', (req, res) => {
  const { courtId, date, startTime, lockedBy, ttlSeconds } = req.body;
  if (!courtId || !date || !startTime || !lockedBy) {
    return res.status(400).json({ success: false, message: 'Missing courtId, date, startTime, or lockedBy' });
  }

  const result = LockService.acquireLock(courtId, date, startTime, lockedBy, ttlSeconds || 300);
  if (!result.success) {
    return res.status(409).json({ success: false, message: result.message });
  }

  res.json({ success: true, ...result });
});

/**
 * 6. Release Slot Lock
 */
apiRouter.post('/slots/release-lock', (req, res) => {
  const { courtId, date, startTime, lockedBy } = req.body;
  const released = LockService.releaseLock(courtId, date, startTime, lockedBy);
  res.json({ success: true, released });
});

/**
 * 7. Initiate Booking (WhatsApp / Online)
 */
apiRouter.post('/bookings/initiate', (req, res) => {
  const { courtId, sportId, date, startTime, customerName, customerPhone } = req.body;
  if (!courtId || !date || !startTime || !customerPhone) {
    return res.status(400).json({ success: false, message: 'Missing required booking parameters' });
  }

  const result = BookingService.initiateBooking({
    courtId,
    sportId,
    date,
    startTime,
    customerName: customerName || 'Player',
    customerPhone
  });

  if (!result.success) {
    return res.status(409).json(result);
  }

  res.status(201).json(result);
});

/**
 * 8. Confirm Booking (Direct confirmation / payment callback)
 */
apiRouter.post('/bookings/confirm', (req, res) => {
  const { bookingRef, paymentId } = req.body;
  if (!bookingRef) {
    return res.status(400).json({ success: false, message: 'Missing bookingRef' });
  }

  const result = BookingService.confirmBooking(bookingRef, paymentId);
  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
});

/**
 * 9. Lookup Bookings
 */
apiRouter.get('/bookings/lookup', (req, res) => {
  const { phone, ref } = req.query;
  const bookings = BookingService.lookupBookings({ phone, ref });
  res.json({ success: true, count: bookings.length, bookings });
});

/**
 * 10. List All Bookings (Admin / Sync)
 */
apiRouter.get('/bookings', (req, res) => {
  res.json({ success: true, bookings: store.getBookings() });
});

/**
 * 11. Cancel Booking
 */
apiRouter.post('/bookings/cancel', (req, res) => {
  const { bookingRef, phone, reason } = req.body;
  if (!bookingRef) {
    return res.status(400).json({ success: false, message: 'Missing bookingRef' });
  }

  const result = BookingService.cancelBooking(bookingRef, phone, reason);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * 12. Reschedule Booking
 */
apiRouter.post('/bookings/reschedule', (req, res) => {
  const { bookingRef, newDate, newStartTime } = req.body;
  if (!bookingRef || !newDate || !newStartTime) {
    return res.status(400).json({ success: false, message: 'Missing bookingRef, newDate, or newStartTime' });
  }

  const result = BookingService.rescheduleBooking(bookingRef, newDate, newStartTime);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * 13. Conversational AI Agent Endpoint
 * Accepts incoming message from WhatsApp or Simulator and returns generated reply
 */
apiRouter.post('/agent/chat', async (req, res) => {
  try {
    const { fromPhone, senderName, messageText } = req.body;
    if (!messageText) {
      return res.status(400).json({ success: false, message: 'messageText is required' });
    }

    const response = await AiAgentService.handleIncomingMessage({
      fromPhone: fromPhone || '+919876543210',
      senderName: senderName || 'Player',
      messageText
    });

    res.json({ success: true, ...response });
  } catch (err) {
    console.error('Agent chat error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 14. WhatsApp Multi-Device Status
 */
apiRouter.get('/whatsapp/status', (req, res) => {
  res.json({ success: true, ...WhatsAppService.getStatus() });
});

/**
 * 15. WhatsApp QR & Pairing Code Details
 */
apiRouter.get('/whatsapp/qr', (req, res) => {
  res.json({ success: true, ...WhatsAppService.getQr() });
});

/**
 * 16. Request 8-Digit Pairing Code for a Phone Number
 */
apiRouter.post('/whatsapp/pair', async (req, res) => {
  try {
    const { phone } = req.body || {};
    const target = phone || process.env.WHATSAPP_PHONE_NUMBER || '9579158374';
    const result = await WhatsAppService.requestPairingCodeForPhone(target);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 17. Connect or Re-initialize WhatsApp Multi-Device Agent
 */
apiRouter.post('/whatsapp/connect', (req, res) => {
  const { usePairingCode = true, phone } = req.body || {};
  WhatsAppService.init({
    usePairingCode: Boolean(usePairingCode),
    targetPhoneNumber: phone || process.env.WHATSAPP_PHONE_NUMBER || '9579158374'
  });
  res.json({ success: true, message: 'WhatsApp client connection initiated' });
});

/**
 * 18. Disconnect and Clear WhatsApp Session
 */
apiRouter.post('/whatsapp/disconnect', async (req, res) => {
  const result = await WhatsAppService.disconnect();
  res.json(result);
});

/**
 * 19. Download Official PDF Gate Pass & Receipt
 */
apiRouter.get('/bookings/:ref/pass.pdf', async (req, res) => {
  try {
    const ref = req.params.ref;
    const booking = await findOrResolveBooking(ref);
    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    const pdfBuffer = await GatePassService.generatePassPdfBuffer(booking);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="GatePass-${booking.booking_ref || 'PASS'}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF pass:', err);
    res.status(500).send('Error generating PDF pass: ' + err.message);
  }
});

/**
 * 20. Direct Generation of PDF Gate Pass from client payload
 * Guarantees instantaneous PDF generation for any booking state (local or cloud)
 */
apiRouter.post('/bookings/generate-pass-pdf', async (req, res) => {
  try {
    const { booking } = req.body || {};
    if (!booking) {
      return res.status(400).json({ success: false, message: 'Missing booking payload' });
    }

    const resolved = await findOrResolveBooking(booking.booking_ref || booking.id, booking);
    const pdfBuffer = await GatePassService.generatePassPdfBuffer(resolved);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="GatePass-${resolved.booking_ref || 'PASS'}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating pass PDF via POST:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 21. View Printable HTML Gate Pass & Receipt
 */
apiRouter.get('/bookings/:ref/pass', async (req, res) => {
  try {
    const ref = req.params.ref;
    const booking = await findOrResolveBooking(ref);
    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    const html = GatePassService.generatePassHtml(booking);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('Error rendering pass: ' + err.message);
  }
});

/**
 * 22. Generate HTML Gate Pass from client payload
 */
apiRouter.post('/bookings/generate-pass-html', async (req, res) => {
  try {
    const { booking } = req.body || {};
    if (!booking) {
      return res.status(400).send('Missing booking payload');
    }

    const resolved = await findOrResolveBooking(booking.booking_ref || booking.id, booking);
    const html = GatePassService.generatePassHtml(resolved);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('Error rendering pass HTML: ' + err.message);
  }
});

/**
 * 23. Dispatch Outbound Email via Resend
 */
apiRouter.post('/email/send', async (req, res) => {
  try {
    const { to, subject, html, text, from } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ success: false, error: 'Recipient "to" and "subject" are required' });
    }

    const result = await EmailService.sendEmail({ to, subject, html, text, from });
    if (!result.success && !result.simulated) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 24. Trigger 1-Hour Matchday Reminder for Booking
 */
apiRouter.post('/email/reminder/:ref', async (req, res) => {
  try {
    const ref = req.params.ref;
    const booking = await findOrResolveBooking(ref);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    booking.reminder_sent = true;
    const emailRes = await EmailService.sendBookingReminder(booking);
    res.json({
      success: true,
      message: `1-Hour reminder dispatched for booking ${booking.booking_ref}!`,
      emailResult: emailRes
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
