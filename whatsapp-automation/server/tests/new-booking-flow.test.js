// Integration Test for New WhatsApp Booking Flow:
// Date Selection -> Sport Selection -> Sport-Filtered Courts & Slots -> Booking Reservation
import assert from 'assert';
import { AiAgentService } from '../src/services/aiAgentService.js';
import { store } from '../src/data/store.js';
import { getVenueDateString } from '../src/utils/venueTime.js';

console.log('\n======================================================');
console.log('🧪 TESTING NEW WHATSAPP BOOKING FLOW (Date -> Sport -> Courts)');
console.log('======================================================\n');

store.reset();
const testPhone = '+919988112233';
const customerName = 'Kunal';

// --- STEP 1: Main Menu & Greeting ---
console.log('--- Step 1: Main Menu Greeting ---');
let res = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: customerName,
  messageText: 'hi'
});
assert(res.reply.includes('Book Turf'), 'Main menu includes Book Turf option');
assert(res.reply.includes('1️⃣'), 'Includes option 1');
console.log('✅ PASSED: Main menu presented with options 1, 2, 3');

// --- STEP 2: Option 1 (Book Turf) prompts for Date ---
console.log('\n--- Step 2: Book Turf triggers Date Selection ---');
res = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: customerName,
  messageText: '1'
});
assert(res.reply.includes('Select Date for Booking'), 'Prompted for date selection');
assert(res.reply.includes('1️⃣ *Today*'), 'Option 1 is Today');
assert(res.reply.includes('2️⃣ *Tomorrow*'), 'Option 2 is Tomorrow');
assert(res.action === 'book_turf_date_prompt', 'Action is book_turf_date_prompt');
console.log('✅ PASSED: Date selection prompt presented');

// --- STEP 3: Selecting Date prompts for Available Sports (NOT dumping all courts!) ---
console.log('\n--- Step 3: Selecting Tomorrow prompts for Sport Choice ---');
res = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: customerName,
  messageText: '2'
});
const tomorrowStr = getVenueDateString(1);
assert(res.reply.includes('Select Sport for'), 'Prompted to select sport for tomorrow');
assert(res.reply.includes('Football'), 'Includes Football option');
assert(res.reply.includes('Cricket'), 'Includes Cricket option');
assert(res.reply.includes('Badminton'), 'Includes Badminton option');
// Ensure it did NOT immediately dump court slots
assert(!res.reply.includes('AVAILABLE SLOTS'), 'Did not prematurely show slots before sport selection');
assert(res.action === 'select_sport_prompt', 'Action is select_sport_prompt');
console.log('✅ PASSED: User given choice of available sports for the chosen date');

// --- STEP 4: Selecting Football only shows Football Courts ---
console.log('\n--- Step 4: Selecting Football filters courts strictly to Football ---');
res = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: customerName,
  messageText: '1' // 1 is Football
});
assert(res.reply.includes('AVAILABLE SLOTS'), 'Now shows available slots');
assert(res.reply.includes('Football'), 'Confirms Football sport header');
assert(res.reply.includes('Turf A'), 'Shows Turf A (Football court)');
assert(res.reply.includes('Turf B'), 'Shows Turf B (Multi-Sport supporting Football)');
assert(!res.reply.includes('Court 1'), 'Court 1 (Badminton only) is EXCLUDED!');
assert(res.action === 'slots_for_sport', 'Action is slots_for_sport');
console.log('✅ PASSED: Only Football courts shown (Turf A & Turf B shown; Court 1 excluded)');

// --- STEP 5: Reserving slot under Football ---
console.log('\n--- Step 5: Booking a Football slot ---');
res = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: customerName,
  messageText: 'Turf A at 8pm'
});
assert(res.action === 'booking_initiated', 'Booking initiated successfully');
assert(res.reply.includes('RESERVATION PENDING PAYMENT'), 'Payment link presented');
assert(res.data?.booking?.sport_id === 'sp-football', 'Booking recorded with Football sport');
assert(res.data?.booking?.court_name.includes('Turf A'), 'Booking reserved on Turf A');
console.log('✅ PASSED: Football booking initiated on Turf A with payment link');

// --- STEP 6: Flow for Badminton (Court 1 only) ---
console.log('\n--- Step 6: Full flow for Badminton ---');
const phone2 = '+919988223344';
// Start booking
await AiAgentService.handleIncomingMessage({ fromPhone: phone2, senderName: 'Priya', messageText: 'book turf' });
// Choose Tomorrow
await AiAgentService.handleIncomingMessage({ fromPhone: phone2, senderName: 'Priya', messageText: '2' });
// Choose Badminton by text name
res = await AiAgentService.handleIncomingMessage({ fromPhone: phone2, senderName: 'Priya', messageText: 'Badminton' });
assert(res.reply.includes('Badminton'), 'Shows Badminton slots');
assert(res.reply.includes('Court 1'), 'Shows Court 1');
assert(!res.reply.includes('Turf A'), 'Turf A is EXCLUDED from Badminton!');
assert(!res.reply.includes('Turf B'), 'Turf B is EXCLUDED from Badminton!');
console.log('✅ PASSED: Only Badminton court (Court 1) shown; Football turfs excluded');

// Reserve Badminton slot by time only: "7:00 PM"
res = await AiAgentService.handleIncomingMessage({ fromPhone: phone2, senderName: 'Priya', messageText: '7:00 PM' });
assert(res.action === 'booking_initiated', 'Booking initiated');
assert(res.data?.booking?.sport_id === 'sp-badminton', 'Recorded under sport sp-badminton');
assert(res.data?.booking?.court_name.includes('Court 1'), 'Auto-resolved to Court 1');
console.log('✅ PASSED: Auto-resolved to Court 1 with sport sp-badminton when time is entered');

// --- STEP 7: Flow for Cricket (Turf B only) ---
console.log('\n--- Step 7: Full flow for Cricket via Root Option 2 (Slots today) ---');
const phone3 = '+919988334455';
// Option 2 from root menu
res = await AiAgentService.handleIncomingMessage({ fromPhone: phone3, senderName: 'Anil', messageText: '2' });
assert(res.reply.includes('Select Sport for'), 'Prompts for sport for today');
// Choose Cricket by number "2"
res = await AiAgentService.handleIncomingMessage({ fromPhone: phone3, senderName: 'Anil', messageText: '2' });
assert(res.reply.includes('Cricket'), 'Shows Cricket slots');
assert(res.reply.includes('Turf B'), 'Shows Turf B');
assert(!res.reply.includes('Turf A'), 'Turf A is EXCLUDED from Cricket!');
assert(!res.reply.includes('Court 1'), 'Court 1 is EXCLUDED from Cricket!');
console.log('✅ PASSED: Only Cricket court (Turf B) shown; Turf A and Court 1 excluded');

// --- STEP 8: Navigation (Change Sport & Change Date) ---
console.log('\n--- Step 8: Navigation controls (Change Sport & Change Date) ---');
// User says "sport" while in slot selection
res = await AiAgentService.handleIncomingMessage({ fromPhone: phone3, senderName: 'Anil', messageText: 'sport' });
assert(res.reply.includes('Select Sport for'), 'Successfully navigated back to sport selection');
// User says "date" while in sport selection
res = await AiAgentService.handleIncomingMessage({ fromPhone: phone3, senderName: 'Anil', messageText: 'date' });
assert(res.reply.includes('Select Date for Booking'), 'Successfully navigated back to date selection');
console.log('✅ PASSED: User can fluidly navigate back to change sport or date');

console.log('\n🎉 ALL NEW BOOKING FLOW TESTS PASSED FLAWLESSLY! 🎉\n');
