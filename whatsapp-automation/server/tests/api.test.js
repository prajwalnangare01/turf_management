// TurfFlow Backend & WhatsApp Automation Test Suite
import { store } from '../src/data/store.js';
import { SlotEngine } from '../src/services/slotEngine.js';
import { LockService } from '../src/services/lockService.js';
import { BookingService } from '../src/services/bookingService.js';
import { AiAgentService } from '../src/services/aiAgentService.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('\n--- 🧪 RUNNING TURFFLOW BACKEND & WHATSAPP SUITE ---\n');

// Reset store
store.reset();
const testDate = '2026-11-10'; // Tuesday
const courts = store.getCourts();
const turfA = courts[0];

// TEST 1: Dynamic Slot Engine
console.log('--- TEST 1: Dynamic Slot Calculation ---');
const slots = SlotEngine.computeSlotsForCourt(turfA, testDate);
assert(slots.length > 0, `Computed ${slots.length} slots for Turf A`);
const peakSlot = slots.find(s => s.start_time === '19:00');
assert(peakSlot && peakSlot.is_peak === true && peakSlot.price === 1800, 'Evening slot 19:00 correctly flagged as Peak with ₹1800 rate');
const morningSlot = slots.find(s => s.start_time === '07:00');
assert(morningSlot && morningSlot.is_peak === false && morningSlot.price === 1200, 'Morning slot 07:00 correctly priced at base ₹1200');

// TEST 2: Concurrency Layer 1 — 5-minute Slot Lock
console.log('\n--- TEST 2: Concurrency Layer 1 — Slot Lock ---');
const lock1 = LockService.acquireLock(turfA.id, testDate, '19:00', '+919999911111', 300);
assert(lock1.success === true, 'Lock acquired by customer 1');

const lockConflict = LockService.acquireLock(turfA.id, testDate, '19:00', '+918888822222', 300);
assert(lockConflict.success === false, 'Customer 2 rejected while customer 1 holds the lock');

LockService.releaseLock(turfA.id, testDate, '19:00', '+919999911111');
assert(LockService.isLockedByOther(turfA.id, testDate, '19:00', '+918888822222') === false, 'Slot lock released cleanly');

// TEST 3: Booking Initiation & Razorpay Link Generation
console.log('\n--- TEST 3: Booking Initiation ---');
const initRes = BookingService.initiateBooking({
  courtId: turfA.id,
  sportId: 'sp-football',
  date: testDate,
  startTime: '20:00',
  customerName: 'Kunal Verma',
  customerPhone: '+919876500000'
});

assert(initRes.success === true, 'Booking initiated successfully');
assert(initRes.booking.status === 'pending_payment', 'Status is pending_payment');
assert(initRes.booking.source === 'offline_whatsapp', 'Source is offline_whatsapp');
assert(initRes.payment.payment_url.includes('rzp.io'), 'Razorpay payment URL generated');
assert(initRes.booking.total_amount === 1800, 'Peak pricing correctly applied to total');

// TEST 4: Booking Confirmation
console.log('\n--- TEST 4: Booking Confirmation ---');
const confRes = BookingService.confirmBooking(initRes.booking.booking_ref, 'pay_test_9999');
assert(confRes.success === true, 'Booking confirmed');
assert(confRes.booking.status === 'confirmed', 'Status updated to confirmed');

// Verify slot is now booked in SlotEngine
const reSlots = SlotEngine.computeSlotsForCourt(turfA, testDate);
const bookedSlot = reSlots.find(s => s.start_time === '20:00');
assert(bookedSlot.status === 'booked_offline', 'Slot engine reports slot as booked_offline');

// TEST 5: Customer Lookup
console.log('\n--- TEST 5: Customer Lookup ---');
const lookup = BookingService.lookupBookings({ phone: '+919876500000' });
assert(lookup.length === 1 && lookup[0].booking_ref === initRes.booking.booking_ref, 'Lookup by phone succeeded');

// TEST 6: Tiered Cancellation & Refund Policy
console.log('\n--- TEST 6: Cancellation Policy ---');
const cancelRes = BookingService.cancelBooking(initRes.booking.booking_ref, '+919876500000', 'Customer requested');
assert(cancelRes.success === true, 'Cancellation succeeded');
assert(cancelRes.refundPct === 100, '>24h before match qualifies for 100% refund');
assert(cancelRes.refundAmount === 1800, 'Full refund amount ₹1800 initiated');
assert(cancelRes.booking.status === 'cancelled', 'Status changed to cancelled');

// TEST 7: AI Agent Natural Language Understanding
console.log('\n--- TEST 7: AI Agent Natural Language Handler ---');
const agentGreeting = await AiAgentService.handleIncomingMessage({
  fromPhone: '+919999988888',
  senderName: 'Vikas',
  messageText: 'Hello'
});
assert(agentGreeting.reply.includes('TurfFlow'), 'Agent greeted customer');

const agentSlots = await AiAgentService.handleIncomingMessage({
  fromPhone: '+919999988888',
  senderName: 'Vikas',
  messageText: 'Show football slots for tomorrow'
});
assert(agentSlots.reply.includes('AVAILABLE SLOTS'), 'Agent returned available slots');

const agentBook = await AiAgentService.handleIncomingMessage({
  fromPhone: '+919999988888',
  senderName: 'Vikas',
  messageText: 'Book Turf A tomorrow at 8pm'
});
assert(agentBook.reply.includes('RESERVATION PENDING PAYMENT'), 'Agent held slot and sent payment link');

// Verify collision handling when user asks for an already booked slot (7pm on 2026-11-05 is seeded as confirmed)
const agentConflict = await AiAgentService.handleIncomingMessage({
  fromPhone: '+919999988888',
  senderName: 'Vikas',
  messageText: 'Book Turf A tomorrow at 8pm'
});
assert(agentConflict.action === 'booking_conflict', 'Agent correctly detected double-booking conflict and prevented duplicate reservation');

console.log('\n🎉 ALL 7 TEST SUITES PASSED FLAWLESSLY! 🎉\n');
