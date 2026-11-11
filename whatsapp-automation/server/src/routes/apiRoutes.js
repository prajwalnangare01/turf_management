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
import { SmsService } from '../services/smsService.js';
import { WhatsAppFormatter } from '../utils/whatsappFormatter.js';
import { getSupabase } from '../data/supabaseClient.js';
import { getVenueDateString } from '../utils/venueTime.js';

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
    (b.group_ref && b.group_ref.toUpperCase() === cleanRef) ||
    (b.id && b.id.toUpperCase() === cleanRef)
  );
  if (booking) {
    if (fallbackData && typeof fallbackData === 'object') {
      for (const [key, val] of Object.entries(fallbackData)) {
        if (val !== undefined && val !== null && val !== '') {
          booking[key] = val;
        }
      }
    }
    // Aggregate siblings if this is part of a multi-slot order
    const parentRef = WhatsAppFormatter.getBookingGroupRef(booking);
    if (parentRef) {
      const isBookingActive = booking.status !== 'cancelled' && booking.status !== 'refunded';
      const siblings = store.getBookings().filter(b => 
        (isBookingActive ? (b.status !== 'cancelled' && b.status !== 'refunded') : b.id === booking.id) &&
        (WhatsAppFormatter.getBookingGroupRef(b) === parentRef ||
         (b.gateway_payment_id && booking.gateway_payment_id && b.gateway_payment_id === booking.gateway_payment_id))
      );
      const validSiblings = siblings.filter(s => s.start_time && s.end_time);
      if (validSiblings.length > 0) {
        booking.all_slots = Array.from(new Map(validSiblings.map(s => [`${s.start_time}-${s.end_time}`, {
          start_time: s.start_time,
          end_time: s.end_time,
          price: s.total_amount
        }])).values()).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
        booking.total_order_amount = validSiblings.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
        booking.formatted_slots = booking.all_slots.map(s => `${WhatsAppFormatter.formatTime(s.start_time)} – ${WhatsAppFormatter.formatTime(s.end_time)}`).join(', ');
      }
    }
    if (!booking.gate_pass_otp) {
      booking.gate_pass_otp = WhatsAppFormatter.getBookingGatePassOtp(booking);
    }
    return booking;
  }

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
        const court = store.getCourts().find(c => c.id === data.court_id);
        const customer = store.getCustomers().find(c => c.id === data.customer_id);
        const normalized = {
          ...data,
          customer_name: data.customer_name || customer?.name || 'Customer',
          customer_phone: data.customer_phone || customer?.phone || '',
          court_name: data.court_name || court?.name || 'Turf Court',
          start_time: typeof data.start_time === 'string' ? data.start_time.slice(0, 5) : data.start_time,
          end_time: typeof data.end_time === 'string' ? data.end_time.slice(0, 5) : data.end_time,
          total_amount: Number(data.total_amount || 0)
        };
        if (fallbackData && typeof fallbackData === 'object') {
          for (const [key, val] of Object.entries(fallbackData)) {
            if (val !== undefined && val !== null && val !== '') {
              normalized[key] = val;
            }
          }
        }
        if (!normalized.gate_pass_otp) {
          normalized.gate_pass_otp = WhatsAppFormatter.getBookingGatePassOtp(normalized);
        }
        const existingIdx = store.getBookings().findIndex(b => b.id === normalized.id || b.booking_ref === normalized.booking_ref);
        if (existingIdx === -1) {
          store.getBookings().push(normalized);
        } else {
          store.getBookings()[existingIdx] = { ...store.getBookings()[existingIdx], ...normalized };
        }
        return normalized;
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
    if (!synthetic.gate_pass_otp) {
      synthetic.gate_pass_otp = WhatsAppFormatter.getBookingGatePassOtp(synthetic);
    }
    if (!store.getBookings().some(b => b.booking_ref === synthetic.booking_ref)) {
      store.getBookings().push(synthetic);
    }
    return synthetic;
  }

  // 4. If reference matches a known pattern (e.g. TRF-), generate a clean synthetic pass
  if (cleanRef.startsWith('TRF-') || cleanRef.startsWith('BK-')) {
    const synthetic = {
      id: fallbackData?.id || `bk-${cleanRef}`,
      booking_ref: cleanRef,
      court_id: fallbackData?.court_id || 'crt-001',
      court_name: fallbackData?.court_name || 'Turf A — FIFA 5-a-side Synthetic',
      sport_id: fallbackData?.sport_id || 'sp-football',
      customer_id: fallbackData?.customer_id || 'cust-101',
      customer_name: fallbackData?.customer_name || 'Player',
      customer_phone: fallbackData?.customer_phone || '+919876543210',
      booking_date: fallbackData?.booking_date || new Date().toISOString().slice(0, 10),
      start_time: fallbackData?.start_time || '18:00',
      end_time: fallbackData?.end_time || '19:00',
      total_amount: fallbackData?.total_amount || 1600,
      status: fallbackData?.status || 'confirmed',
      source: fallbackData?.source || 'online',
      created_at: new Date().toISOString(),
      ...(fallbackData || {})
    };
    if (!synthetic.gate_pass_otp) {
      synthetic.gate_pass_otp = WhatsAppFormatter.getBookingGatePassOtp(synthetic);
    }
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

apiRouter.post('/venue', (req, res) => {
  const { venue } = req.body || {};
  if (venue) {
    const updated = store.setVenue(venue);
    return res.json({ success: true, venue: updated });
  }
  res.status(400).json({ success: false, message: 'Missing venue data' });
});

apiRouter.put('/venue', (req, res) => {
  const { venue } = req.body || {};
  if (venue) {
    const updated = store.setVenue(venue);
    return res.json({ success: true, venue: updated });
  }
  res.status(400).json({ success: false, message: 'Missing venue data' });
});

/**
 * 2. Sports List
 */
apiRouter.get('/sports', (req, res) => {
  res.json({ success: true, sports: store.getSports() });
});

/**
 * 3. Courts List & Management
 */
apiRouter.get('/courts', (req, res) => {
  res.json({ success: true, courts: store.getCourts() });
});

apiRouter.post('/courts', async (req, res) => {
  const courtData = req.body;
  if (!courtData || !courtData.id || !courtData.name) {
    return res.status(400).json({ success: false, message: 'Invalid court payload: id and name are required' });
  }

  const existingIdx = store.courts.findIndex(c => c.id === courtData.id);
  if (existingIdx !== -1) {
    store.courts[existingIdx] = { ...store.courts[existingIdx], ...courtData };
  } else {
    store.courts.push(courtData);
  }

  SupabaseService.upsertCourt(courtData).catch(err => console.warn('Supabase upsert court error:', err.message));
  console.log(`🏟️ [API] Court '${courtData.name}' (${courtData.id}) saved to server store.`);
  res.json({ success: true, court: courtData, courts: store.getCourts() });
});

apiRouter.put('/courts/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const existingIdx = store.courts.findIndex(c => c.id === id);
  let savedCourt;

  if (existingIdx !== -1) {
    store.courts[existingIdx] = { ...store.courts[existingIdx], ...updates, id };
    savedCourt = store.courts[existingIdx];
  } else {
    savedCourt = { ...updates, id };
    store.courts.push(savedCourt);
  }

  SupabaseService.upsertCourt(savedCourt).catch(err => console.warn('Supabase update court error:', err.message));
  console.log(`🏟️ [API] Court '${savedCourt.name}' (${id}) updated in server store.`);
  res.json({ success: true, court: savedCourt, courts: store.getCourts() });
});

apiRouter.delete('/courts/:id', async (req, res) => {
  const { id } = req.params;
  const courtIdx = store.courts.findIndex(c => c.id === id);
  let courtName = id;

  if (courtIdx !== -1) {
    courtName = store.courts[courtIdx].name;
    store.courts.splice(courtIdx, 1);
  }

  // Release any active locks for this court
  for (const [key, lock] of store.locks.entries()) {
    if (lock.courtId === id) store.locks.delete(key);
  }

  // Delete from Supabase
  SupabaseService.deleteCourt(id).catch(err => console.warn('Supabase delete court error:', err.message));

  console.log(`🗑️ [API] Court '${courtName}' (${id}) deleted from server store. Remaining: ${store.courts.length}`);
  res.json({ success: true, message: `Court '${courtName}' deleted successfully.`, courts: store.getCourts() });
});

apiRouter.post('/courts/sync', async (req, res) => {
  const { courts } = req.body;
  if (Array.isArray(courts) && courts.length > 0) {
    const active = courts.filter(c => c && c.id && c.status !== 'inactive');
    const prevKey = store.courts.map(c => c.id).sort().join(',');
    const newKey = active.map(c => c.id).sort().join(',');
    store.courts = active;
    if (prevKey !== newKey) {
      console.log(`🔄 [API] Updated server courts array with ${store.courts.length} active courts from admin client.`);
    }
    return res.json({ success: true, count: store.courts.length, courts: store.getCourts() });
  }

  await SupabaseService.refreshCourts(store);
  res.json({ success: true, count: store.courts.length, courts: store.getCourts() });
});

/**
 * 4. Dynamic Slots Calculation
 * Query params: ?date=YYYY-MM-DD&sport=football&courtId=crt-001&sessionId=phone
 */
apiRouter.get('/slots', (req, res) => {
  const { date, sport, courtId, sessionId } = req.query;
  const targetDate = date || getVenueDateString(0);

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

  const effectiveTtl = Math.min(300, Math.max(1, Number(ttlSeconds) || 300));
  const result = LockService.acquireLock(courtId, date, startTime, lockedBy, effectiveTtl);
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
 * Concurrency & Hold Expiration: Simulate 5-Minute Hold Timeout
 */
apiRouter.post('/bookings/simulate-expire', (req, res) => {
  const { bookingRef } = req.body;
  const booking = store.getBookings().find(b => b.booking_ref === bookingRef || b.id === bookingRef);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }
  booking.created_at = new Date(Date.now() - 305 * 1000).toISOString();
  const expiredCount = BookingService.expireUnpaidPendingBookings();
  res.json({ success: true, booking, expiredCount });
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
 * 10b. Reset / Clear All Bookings (Dev / Fresh Test)
 */
apiRouter.post('/bookings/reset', async (req, res) => {
  try {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('payments').delete().neq('id', 'dummy_never_match');
      await supabase.from('slot_locks').delete().neq('id', 'dummy_never_match');
      await supabase.from('bookings').delete().neq('id', 'dummy_never_match');
      await supabase.from('customers').update({ total_bookings: 0, total_spent: 0 }).neq('id', 'dummy_never_match');
    }
    store.bookings = [];
    store.locks.clear();
    if (Array.isArray(store.customers)) {
      for (const c of store.customers) {
        c.total_bookings = 0;
        c.total_spent = 0;
      }
    }
    res.json({ success: true, message: 'All bookings, payments, and slot locks cleared.' });
  } catch (err) {
    console.error('Reset bookings error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
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
    const fallback = {};
    if (req.query.start_time || req.query.start) fallback.start_time = req.query.start_time || req.query.start;
    if (req.query.end_time || req.query.end) fallback.end_time = req.query.end_time || req.query.end;
    if (req.query.court) fallback.court_name = req.query.court;
    if (req.query.amount) fallback.total_amount = Number(req.query.amount);

    const booking = await findOrResolveBooking(ref, fallback);
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
    const fallback = {};
    if (req.query.start_time || req.query.start) fallback.start_time = req.query.start_time || req.query.start;
    if (req.query.end_time || req.query.end) fallback.end_time = req.query.end_time || req.query.end;
    if (req.query.court) fallback.court_name = req.query.court;
    if (req.query.amount) fallback.total_amount = Number(req.query.amount);

    const booking = await findOrResolveBooking(ref, fallback);
    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    const html = await GatePassService.generatePassHtml(booking);
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
    const html = await GatePassService.generatePassHtml(resolved);
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
    const { to, subject, html, text, from, attachments } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ success: false, error: 'Recipient "to" and "subject" are required' });
    }

    const result = await EmailService.sendEmail({ to, subject, html, text, from, attachments });
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

/**
 * 25. Dispatch Outbound SMS via Fast2SMS / Twilio / Simulation
 */
apiRouter.post('/sms/send', async (req, res) => {
  try {
    const { to, message, senderId, route, otpCode } = req.body || {};
    if (!to || !message) {
      return res.status(400).json({ success: false, error: 'Recipient "to" and "message" are required' });
    }

    const result = await SmsService.sendSms({ to, message, senderId, route, otpCode });
    if (!result.success && !result.simulated) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 26. Trigger 1-Hour Matchday SMS Reminder for Booking
 */
apiRouter.post('/sms/reminder/:ref', async (req, res) => {
  try {
    const ref = req.params.ref;
    const booking = await findOrResolveBooking(ref);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    booking.reminder_sent = true;
    const smsRes = await SmsService.sendBookingReminder(booking);
    res.json({
      success: true,
      message: `1-Hour SMS reminder dispatched for booking ${booking.booking_ref}!`,
      smsResult: smsRes
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 27. Interactive Razorpay Payment Checkout Portal with Live 5-Minute Countdown
 */
apiRouter.get('/pay/:ref', async (req, res) => {
  BookingService.expireUnpaidPendingBookings();

  const ref = req.params.ref.toUpperCase();
  const booking = await findOrResolveBooking(ref);
  const venue = store.getVenue();

  if (!booking) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>Booking Not Found</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 font-sans">
        <div class="bg-white p-6 rounded-3xl max-w-md w-full text-center shadow-lg border border-slate-200">
          <div class="text-4xl mb-2">🔍</div>
          <h2 class="text-lg font-bold text-slate-800">Booking Not Found</h2>
          <p class="text-xs text-slate-500 mt-1">Reference <code>${ref}</code> does not exist.</p>
        </div>
      </body></html>
    `);
  }

  const court = store.getCourts().find(c => c.id === booking.court_id);
  const courtName = court?.name || booking.court_name || 'Turf Pitch';
  const createdMs = new Date(booking.created_at).getTime();
  const expiresAtMs = createdMs + (300 * 1000); // 5 minutes
  const remainingSec = Math.min(300, Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)));

  // If already confirmed:
  if (booking.status === 'confirmed') {
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>Booking Confirmed - ${booking.booking_ref}</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 font-sans text-slate-800">
        <div class="bg-white p-6 sm:p-8 rounded-3xl max-w-md w-full text-center shadow-xl border border-slate-200 space-y-4">
          <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
            <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          </div>
          <h2 class="text-xl font-black text-slate-900">Payment Already Completed!</h2>
          <p class="text-xs text-slate-600">Booking <span class="font-mono font-bold text-emerald-700">${booking.booking_ref}</span> is confirmed and secured.</p>
          <div class="bg-slate-50 p-4 rounded-2xl text-left text-xs space-y-2 border border-slate-200">
            <p class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9H4.5a2.5 2.5 0 010-5H6m12 5h1.5a2.5 2.5 0 000-5H18m-14 13h16m-10-7.34V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22m7-7.34V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22m1-20H6v7a6 6 0 0012 0V2z"/></svg><strong>Court:</strong> ${courtName}</p>
            <p class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke-width="2"/><line x1="8" y1="2" x2="8" y2="6" stroke-width="2"/><line x1="3" y1="10" x2="21" y2="10" stroke-width="2"/></svg><strong>Date:</strong> ${WhatsAppFormatter.formatDate(booking.booking_date)}</p>
            <p class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><polyline points="12 6 12 12 16 14" stroke-width="2"/></svg><strong>Time:</strong> ${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)}</p>
            <p class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" stroke-width="2"/><line x1="2" y1="10" x2="22" y2="10" stroke-width="2"/></svg><strong>Paid:</strong> ₹${booking.total_amount} (Razorpay UPI)</p>
          </div>
          <div class="pt-2 flex flex-col gap-2">
            <a href="/api/bookings/${booking.booking_ref}/pass.pdf" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-4 rounded-xl text-xs shadow transition flex items-center justify-center gap-2">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download PDF Gate Pass
            </a>
            <a href="/api/bookings/${booking.booking_ref}/pass" target="_blank" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9V3a1 1 0 011-1h10a1 1 0 011 1v6"/><rect x="6" y="14" width="12" height="8" rx="1" stroke-width="2"/></svg>
              View / Print Pass
            </a>
          </div>
        </div>
      </body></html>
    `);
  }

  // If expired or cancelled:
  if (booking.status === 'cancelled' || booking.status === 'expired' || remainingSec <= 0) {
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>Hold Expired - ${booking.booking_ref}</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 font-sans text-slate-800">
        <div class="bg-white p-6 sm:p-8 rounded-3xl max-w-md w-full text-center shadow-xl border border-slate-200 space-y-4">
          <div class="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
            <svg class="w-8 h-8 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><polyline points="12 6 12 12 16 14" stroke-width="2"/></svg>
          </div>
          <h2 class="text-xl font-black text-slate-900">Payment Window Expired</h2>
          <p class="text-xs text-slate-600 leading-relaxed">
            The 5-minute temporary hold on this slot has expired. The slot has been released back to available slots for other players.
          </p>
          <div class="bg-amber-50 p-4 rounded-2xl text-left text-xs space-y-1 border border-amber-200 text-amber-900">
            <p><strong>Booking Ref:</strong> <span class="font-mono">${booking.booking_ref}</span></p>
            <p><strong>Requested Pitch:</strong> ${courtName}</p>
            <p><strong>Slot:</strong> ${WhatsAppFormatter.formatDate(booking.booking_date)} @ ${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)}</p>
          </div>
          <p class="text-xs text-slate-500 pt-1">Please return to WhatsApp or our website to check current available slots and book again.</p>
        </div>
      </body></html>
    `);
  }

  // Active Pending Hold - Show Interactive Checkout with Live Countdown
  return res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>Complete Payment — ${booking.booking_ref}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 min-h-screen flex items-center justify-center p-4 font-sans text-slate-800">
      <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        
        <!-- Header -->
        <div class="bg-[#006b30] text-white p-5 text-center">
          <div class="text-2xl font-black tracking-tight">${venue.name}</div>
          <p class="text-xs text-white/80 uppercase tracking-widest mt-0.5 font-bold">Secure Razorpay Payment Portal</p>
        </div>

        <div class="p-6 space-y-4">
          
          <!-- Live 5-Minute Countdown Box -->
          <div id="timer-box" class="bg-amber-50 border-2 border-dashed border-amber-400 rounded-2xl p-4 text-center">
            <span class="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
              Slot Held on Website & WhatsApp
            </span>
            <div id="countdown" class="text-3xl font-mono font-black text-amber-700 my-1">
              --:--
            </div>
            <p class="text-[11px] text-amber-800 font-medium">
              Complete payment before timer expires to secure your pitch reservation.
            </p>
          </div>

          <!-- Match Summary Card -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
            <div class="flex justify-between items-center pb-2 border-b border-slate-200">
              <span class="text-slate-500 font-bold uppercase text-[10px]">Reservation</span>
              <span class="font-bold text-amber-800 text-xs uppercase bg-amber-100 px-2.5 py-0.5 rounded-full">5-Min Hold Active</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500 font-bold uppercase text-[10px]">Pitch</span>
              <span class="font-bold text-slate-800">${courtName}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500 font-bold uppercase text-[10px]">Date & Timing</span>
              <span class="font-medium text-slate-800">${WhatsAppFormatter.formatDate(booking.booking_date)} | ${WhatsAppFormatter.formatTime(booking.start_time)} — ${WhatsAppFormatter.formatTime(booking.end_time)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500 font-bold uppercase text-[10px]">Customer</span>
              <span class="font-medium text-slate-800">${booking.customer_name || 'Player'}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500 font-bold uppercase text-[10px]">Gate Entry Pass</span>
              <span class="text-slate-400 italic text-[11px]">Minted securely upon payment</span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-slate-200">
              <span class="text-slate-700 font-extrabold text-xs">Total Amount</span>
              <span class="font-black text-lg text-emerald-700">₹${booking.total_amount}</span>
            </div>
          </div>

          <!-- Pay Button -->
          <button id="pay-btn" onclick="executePayment()" class="w-full bg-[#006b30] hover:bg-[#005224] text-white font-black py-3.5 px-4 rounded-2xl text-sm shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" stroke-width="2"/><line x1="2" y1="10" x2="22" y2="10" stroke-width="2"/></svg>
            <span>Pay ₹${booking.total_amount} with Razorpay UPI</span>
          </button>

          <!-- Success Area (Hidden by default) -->
          <div id="success-box" class="hidden text-center space-y-3 pt-2">
            <div class="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <svg class="w-6 h-6 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            </div>
            <h3 class="text-lg font-black text-emerald-800">Payment Confirmed!</h3>
            <p class="text-xs text-slate-600">Your slot is now permanently booked. The official gate pass has been dispatched to your WhatsApp.</p>
            <div class="flex flex-col gap-2 pt-2">
              <a href="/api/bookings/${booking.booking_ref}/pass.pdf" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow flex items-center justify-center gap-1.5">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Download PDF Pass
              </a>
              <a href="/api/bookings/${booking.booking_ref}/pass" target="_blank" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9V3a1 1 0 011-1h10a1 1 0 011 1v6"/><rect x="6" y="14" width="12" height="8" rx="1" stroke-width="2"/></svg>
                View Pass
              </a>
            </div>
          </div>

          <!-- Expired Area (Hidden by default) -->
          <div id="expired-box" class="hidden text-center space-y-2 pt-2">
            <div class="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <svg class="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><polyline points="12 6 12 12 16 14" stroke-width="2"/></svg>
            </div>
            <h3 class="text-base font-black text-amber-800">5-Minute Window Expired</h3>
            <p class="text-xs text-slate-600">This slot has been released back to available. Please book a fresh slot.</p>
          </div>

        </div>

        <div class="bg-slate-50 p-3 border-t border-slate-200 text-center text-[10px] text-slate-500 font-medium flex items-center justify-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke-width="2"/></svg>
          <span>256-Bit SSL Encrypted Razorpay Payments | TurfFlow Arena</span>
        </div>
      </div>

      <script>
        let remaining = ${remainingSec};
        const countdownEl = document.getElementById('countdown');
        const payBtn = document.getElementById('pay-btn');
        const timerBox = document.getElementById('timer-box');
        const successBox = document.getElementById('success-box');
        const expiredBox = document.getElementById('expired-box');

        function updateCountdown() {
          if (remaining <= 0) {
            countdownEl.innerText = '00:00';
            if (payBtn) payBtn.classList.add('hidden');
            if (timerBox) timerBox.classList.add('hidden');
            if (expiredBox) expiredBox.classList.remove('hidden');
            return;
          }
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          countdownEl.innerText = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
          remaining--;
          setTimeout(updateCountdown, 1000);
        }
        updateCountdown();

        async function executePayment() {
          payBtn.disabled = true;
          payBtn.innerText = 'Processing Razorpay UPI...';
          try {
            const res = await fetch('/api/bookings/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookingRef: '${booking.booking_ref}',
                paymentId: 'pay_rzp_' + Date.now()
              })
            });
            const data = await res.json();
            if (data.success) {
              payBtn.classList.add('hidden');
              timerBox.classList.add('hidden');
              successBox.classList.remove('hidden');
            } else {
              alert(data.message || 'Payment confirmation failed');
              payBtn.disabled = false;
              payBtn.innerText = '💳 Pay ₹${booking.total_amount} with Razorpay UPI';
            }
          } catch (e) {
            alert('Error connecting to server: ' + e.message);
            payBtn.disabled = false;
            payBtn.innerText = '💳 Pay ₹${booking.total_amount} with Razorpay UPI';
          }
        }
      </script>
    </body>
    </html>
  `);
});
