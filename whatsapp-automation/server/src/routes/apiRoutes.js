// REST API Routes for TurfFlow Backend and n8n Tools
import express from 'express';
import { store } from '../data/store.js';
import { SlotEngine } from '../services/slotEngine.js';
import { LockService } from '../services/lockService.js';
import { BookingService } from '../services/bookingService.js';
import { AiAgentService } from '../services/aiAgentService.js';

export const apiRouter = express.Router();

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
