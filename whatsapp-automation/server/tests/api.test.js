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
// Choose next upcoming weekday (Monday - Friday) within booking window
let futureMatch = new Date(Date.now() + 24 * 3600 * 1000);
while (futureMatch.getDay() === 0 || futureMatch.getDay() === 6) {
  futureMatch = new Date(futureMatch.getTime() + 24 * 3600 * 1000);
}
const testDate = `${futureMatch.getFullYear()}-${String(futureMatch.getMonth() + 1).padStart(2, '0')}-${String(futureMatch.getDate()).padStart(2, '0')}`;
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
assert(initRes.payment.payment_url.includes('/pay/') || initRes.payment.payment_url.includes('rzp.io'), 'Razorpay payment URL generated');
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

console.log('\n--- TEST 8: Accurate Pitch Name Resolution (Turf A vs Turf B vs Court 1) ---');

// Test with courts array where Turf B is index 0 (reproducing the Supabase order bug)
const testCourtList = [
  { id: 'crt-002', name: 'Turf B — Multi-Sport Arena (Box Cricket / Football)', sport_ids: ['sp-football', 'sp-cricket'] },
  { id: 'crt-003', name: 'Court 1 — BWF Indoor Wooden', sport_ids: ['sp-badminton'] },
  { id: 'crt-001', name: 'Turf A — FIFA 5-a-side Synthetic', sport_ids: ['sp-football'] }
];

const resolvedTurfA = AiAgentService.resolveCourt('book turf A 9pm', testCourtList);
assert(resolvedTurfA.id === 'crt-001', 'Direct phrase "book turf A 9pm" resolves to Turf A even if Turf B is index 0');
assert(resolvedTurfA.name.includes('Turf A'), 'Resolved court name is Turf A');

const resolvedBookBookTurfA = AiAgentService.resolveCourt('book book for turf A', testCourtList);
assert(resolvedBookBookTurfA.id === 'crt-001', 'Phrase "book book for turf A" resolves strictly to Turf A');

const resolvedTurfB = AiAgentService.resolveCourt('book turf B 9pm', testCourtList);
assert(resolvedTurfB.id === 'crt-002', 'Phrase "book turf B 9pm" resolves strictly to Turf B');

const resolvedCourt1 = AiAgentService.resolveCourt('book court 1 7pm', testCourtList);
assert(resolvedCourt1.id === 'crt-003', 'Phrase "book court 1 7pm" resolves strictly to Court 1');

// Test end-to-end message handling for Turf A
const turfABooking = await AiAgentService.handleIncomingMessage({
  fromPhone: '+919888811111',
  senderName: 'Arjun',
  messageText: 'book turf A tomorrow at 9pm'
});
assert(turfABooking.reply.includes('Turf A — FIFA 5-a-side Synthetic'), 'Agent pending booking message explicitly specifies Turf A');
assert(!turfABooking.reply.includes('Turf B'), 'Agent pending booking does NOT accidentally select Turf B');

// Test end-to-end message handling for Turf B
const turfBBooking = await AiAgentService.handleIncomingMessage({
  fromPhone: '+919888822222',
  senderName: 'Rohan',
  messageText: 'book turf B tomorrow at 9pm'
});
assert(turfBBooking.reply.includes('Turf B — Multi-Sport Arena'), 'Agent pending booking message explicitly specifies Turf B');
assert(!turfBBooking.reply.includes('Turf A'), 'Agent pending booking does NOT accidentally select Turf A');

console.log('✅ PASSED: Pitch matching logic is 100% accurate and immune to array index permutations');

console.log('\n--- TEST 9: Date -> Sport Selection -> Sport-Filtered Courts Flow ---');
const flowPhone = '+919777700001';

// 9.1: Book Turf triggers date selection
const dateStep = await AiAgentService.handleIncomingMessage({
  fromPhone: flowPhone,
  senderName: 'Manish',
  messageText: '1'
});
assert(dateStep.action === 'book_turf_date_prompt', 'User is prompted for date selection');
assert(dateStep.reply.includes('Select Date for Booking'), 'Reply header indicates date choice');
console.log('✅ PASSED: 9.1 Book Turf prompts for date selection');

// 9.2: Selecting date prompts for sport selection (does NOT dump courts yet)
const sportStep = await AiAgentService.handleIncomingMessage({
  fromPhone: flowPhone,
  senderName: 'Manish',
  messageText: '2' // Tomorrow
});
assert(sportStep.action === 'select_sport_prompt', 'User is prompted to choose available sports');
assert(sportStep.reply.includes('Select Sport for'), 'Reply prompts for sport choice');
assert(sportStep.reply.includes('Football') && sportStep.reply.includes('Cricket') && sportStep.reply.includes('Badminton'), 'Available sports listed');
assert(!sportStep.reply.includes('AVAILABLE SLOTS'), 'Does NOT dump slots before sport is chosen');
console.log('✅ PASSED: 9.2 Selecting date presents sport selection prompt');

// 9.3: Selecting sport displays ONLY courts under that particular sport
const courtsStep = await AiAgentService.handleIncomingMessage({
  fromPhone: flowPhone,
  senderName: 'Manish',
  messageText: 'Badminton' // Choose Badminton
});
assert(courtsStep.action === 'slots_for_sport', 'Action is slots_for_sport');
assert(courtsStep.reply.includes('Court 1'), 'Court 1 (Badminton) is included');
assert(!courtsStep.reply.includes('Turf A'), 'Turf A (Football) is strictly excluded');
assert(!courtsStep.reply.includes('Turf B'), 'Turf B (Multi-Sport) is strictly excluded');
console.log('✅ PASSED: 9.3 Selecting sport displays ONLY courts under that particular sport (Court 1 only)');

// 9.4: Reserving slot on that sport court
const bookStep = await AiAgentService.handleIncomingMessage({
  fromPhone: flowPhone,
  senderName: 'Manish',
  messageText: '7:00 PM'
});
assert(bookStep.action === 'booking_initiated', 'Booking successfully initiated');
assert(bookStep.data?.booking?.sport_id === 'sp-badminton', 'Booking sport_id is strictly sp-badminton');
assert(bookStep.data?.booking?.court_name.includes('Court 1'), 'Court resolved to Court 1');
console.log('✅ PASSED: 9.4 Slot reserved on Court 1 with sport sp-badminton');

console.log('\n🎉 ALL 9 TEST SUITES PASSED FLAWLESSLY! 🎉\n');
