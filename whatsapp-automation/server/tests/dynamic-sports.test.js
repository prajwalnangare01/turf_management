// Verification: Dynamic Sports from DB / Store (Zero Hardcoding)
import assert from 'assert';
import { AiAgentService } from '../src/services/aiAgentService.js';
import { store } from '../src/data/store.js';

console.log('\n======================================================');
console.log('🧪 TESTING DYNAMIC SPORTS (Admin Adds Swimming / Custom Sports)');
console.log('======================================================\n');

store.reset();
const testPhone = '+919999000111';

// Step 1: Baseline sports (Football, Cricket, Badminton)
let sports = AiAgentService.getAvailableSports();
console.log('Baseline Available Sports:', sports.map(s => `${s.icon} ${s.name}`).join(', '));
assert(!sports.some(s => s.name.toLowerCase() === 'swimming'), 'Swimming is not yet in venue');

// Step 2: Admin creates "Swimming" in the database
console.log('\n--- Admin creates "Swimming" in DB and configures a Pool court ---');
const swimmingSport = {
  id: 'sp-swimming',
  name: 'Swimming',
  icon: '🏊',
  subtitle: 'Olympic & Heated Pool'
};
store.sports.push(swimmingSport);

// Admin configures a court for Swimming: "Olympic Pool 1"
const poolCourt = {
  id: 'crt-pool-01',
  venue_id: 'ven-001',
  sport_ids: ['sp-swimming'],
  name: 'Olympic Pool — Heated 50m Lane',
  slot_duration_minutes: 60,
  opening_time: '06:00',
  closing_time: '21:00',
  buffer_minutes: 0,
  status: 'active',
  base_price_per_hour: 400,
  peak_enabled: true,
  peak_start_time: '18:00',
  peak_end_time: '21:00',
  peak_price_per_hour: 600
};
store.courts.push(poolCourt);

// Step 3: Now check getAvailableSports()
sports = AiAgentService.getAvailableSports();
console.log('New Available Sports after DB update:', sports.map(s => `${s.icon} ${s.name}`).join(', '));
assert(sports.some(s => s.name === 'Swimming'), 'Swimming is dynamically detected!');
console.log('✅ PASSED: Swimming dynamically appeared in available sports list');

// Step 4: WhatsApp customer starts booking flow
console.log('\n--- Customer interacts with WhatsApp bot ---');
// 1. Customer initiates "Book Turf"
await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: 'Deepak',
  messageText: '1'
});

// 2. Customer selects "Today" (1)
const sportPromptRes = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: 'Deepak',
  messageText: '1'
});

console.log('WhatsApp Sport Selection Prompt:\n' + sportPromptRes.reply);
assert(sportPromptRes.reply.includes('Swimming'), 'WhatsApp prompt dynamically includes Swimming 🏊!');
assert(sportPromptRes.reply.includes('🏊'), 'WhatsApp prompt includes the swimming emoji');
console.log('✅ PASSED: WhatsApp prompt dynamically displayed 🏊 Swimming to the user!');

// 3. Customer replies with "Swimming"
const slotsRes = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: 'Deepak',
  messageText: 'Swimming'
});

console.log('\nWhatsApp Slots for Swimming:\n' + slotsRes.reply);
assert(slotsRes.reply.includes('Olympic Pool'), 'Shows the Olympic Pool court');
assert(!slotsRes.reply.includes('Turf A'), 'Turf A (Football) is EXCLUDED');
assert(!slotsRes.reply.includes('Court 1'), 'Court 1 (Badminton) is EXCLUDED');
console.log('✅ PASSED: WhatsApp only showed Olympic Pool court under Swimming!');

// 4. Customer reserves 5:00 PM slot (evening today)
const bookRes = await AiAgentService.handleIncomingMessage({
  fromPhone: testPhone,
  senderName: 'Deepak',
  messageText: 'Olympic Pool at 5:00 PM'
});

assert(bookRes.action === 'booking_initiated', 'Booking initiated successfully');
assert(bookRes.data?.booking?.sport_id === 'sp-swimming', 'Booking sport_id is sp-swimming');
assert(bookRes.data?.booking?.court_name.includes('Olympic Pool'), 'Booked on Olympic Pool');
console.log('✅ PASSED: Booking completed for 🏊 Swimming on Olympic Pool!');

console.log('\n🎉 DYNAMIC DATABASE SPORTS VERIFICATION PASSED 100%! 🎉\n');
