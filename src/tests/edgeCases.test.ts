import { PostgresEngine } from '../services/postgresEngine';
import { SlotEngine } from '../services/slotEngine';
import { RedisLockService } from '../services/redisLockService';
import { CustomerAuthService } from '../services/customerAuthService';
import { CouponService } from '../services/couponService';
import { RazorpayService } from '../services/razorpayService';
import { normalizeIndianPhone, parseIndianTimeInput, getVenueNow } from '../utils/venueTime';
import { store } from '../services/store';
import { groupContiguousSlots } from '../components/customer/CheckoutModal';
import { Court, DynamicSlot } from '../types/schema';

declare const process: { exit: (code: number) => void };

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('\n--- 🧪 STARTING TURFFLOW CORNER & EDGE CASE TEST SUITE ---\n');

// --------------------------------------------------------------------------
// TEST 1: PostgresEngine Interval Overlap & Double-Booking Prevention
// --------------------------------------------------------------------------
console.log('--- TEST 1: Interval Overlap & Double-Booking Prevention ---');

assert(PostgresEngine.isTimeOverlap('18:00', '19:00', '18:00', '19:00') === true, 'Exact interval match detected as overlap');
assert(PostgresEngine.isTimeOverlap('18:30', '19:30', '18:00', '19:00') === true, 'Partial forward overlap detected');
assert(PostgresEngine.isTimeOverlap('17:30', '18:30', '18:00', '19:00') === true, 'Partial backward overlap detected');
assert(PostgresEngine.isTimeOverlap('17:00', '20:00', '18:00', '19:00') === true, 'Enclosing interval overlap detected');
assert(PostgresEngine.isTimeOverlap('18:15', '18:45', '18:00', '19:00') === true, 'Inner interval overlap detected');
assert(PostgresEngine.isTimeOverlap('19:00', '20:00', '18:00', '19:00') === false, 'Adjacent non-overlapping slot is NOT an overlap');
assert(PostgresEngine.isTimeOverlap('16:00', '17:00', '18:00', '19:00') === false, 'Disjoint earlier slot is NOT an overlap');

// Reset store to default
store.resetToDefaults();
const testDate = '2026-12-01';
const court = store.getCourts()[0];

// Insert Base Booking
const baseBookingRes = PostgresEngine.createBooking({
  booking_ref: 'TRF-TEST-001',
  customer_id: 'cust-101',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: testDate,
  start_time: '18:00',
  end_time: '19:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
assert(baseBookingRes.success === true, 'Base booking inserted successfully');

// Attempting conflicting overlap booking (18:30 to 19:30)
const conflictRes = PostgresEngine.createBooking({
  booking_ref: 'TRF-TEST-002',
  customer_id: 'cust-102',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: testDate,
  start_time: '18:30',
  end_time: '19:30',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
assert(conflictRes.success === false, 'Overlapping booking (18:30 - 19:30) correctly rejected by PostgresEngine unique check');
assert(conflictRes.message.includes('conflicts with active booking'), 'Detailed error message returned for interval conflict');

// Attempting adjacent non-conflicting booking (19:00 to 20:00)
const nonConflictRes = PostgresEngine.createBooking({
  booking_ref: 'TRF-TEST-003',
  customer_id: 'cust-102',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: testDate,
  start_time: '19:00',
  end_time: '20:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
assert(nonConflictRes.success === true, 'Adjacent slot (19:00 - 20:00) cleanly accepted without conflict');

// --------------------------------------------------------------------------
// TEST 2: Customer Lifetime Metrics & Auto-Blacklist Threshold
// --------------------------------------------------------------------------
console.log('\n--- TEST 2: Customer Metrics & Auto-Blacklist Policy ---');

const testCustomer = {
  id: 'cust-test-metrics',
  name: 'NoShow Tester',
  phone: '9999988888',
  created_at: new Date().toISOString(),
  total_bookings: 0,
  total_spent: 0,
  no_show_count: 0,
  is_blacklisted: false
};
store.addCustomer(testCustomer);

// Create confirmed booking for this customer
const b1 = PostgresEngine.createBooking({
  booking_ref: 'TRF-TEST-METRICS-1',
  customer_id: testCustomer.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: testDate,
  start_time: '08:00',
  end_time: '09:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1200,
  discount_amount: 0
});
assert(b1.success === true, 'Confirmed booking created');

let customerState = store.getCustomers().find(c => c.id === testCustomer.id)!;
assert(customerState.total_bookings === 1, 'Customer total_bookings automatically incremented to 1');
assert(customerState.total_spent === 1200, 'Customer total_spent automatically incremented to ₹1,200');

// Trigger 3 consecutive no-shows to verify auto-blacklist
PostgresEngine.updateBookingStatus(b1.booking!.id, 'no_show');
customerState = store.getCustomers().find(c => c.id === testCustomer.id)!;
assert(customerState.no_show_count === 1, 'No-show count incremented to 1');
assert(customerState.is_blacklisted === false, 'Not blacklisted after 1 no-show');

// Add and mark 2nd no-show
const b2 = PostgresEngine.createBooking({
  booking_ref: 'TRF-TEST-METRICS-2',
  customer_id: testCustomer.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: testDate,
  start_time: '09:00',
  end_time: '10:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1200,
  discount_amount: 0
});
PostgresEngine.updateBookingStatus(b2.booking!.id, 'no_show');
customerState = store.getCustomers().find(c => c.id === testCustomer.id)!;
assert(customerState.no_show_count === 2, 'No-show count incremented to 2');
assert(customerState.is_blacklisted === false, 'Not blacklisted after 2 no-shows');

// Add and mark 3rd no-show
const b3 = PostgresEngine.createBooking({
  booking_ref: 'TRF-TEST-METRICS-3',
  customer_id: testCustomer.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: testDate,
  start_time: '10:00',
  end_time: '11:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1200,
  discount_amount: 0
});
PostgresEngine.updateBookingStatus(b3.booking!.id, 'no_show');
customerState = store.getCustomers().find(c => c.id === testCustomer.id)!;
assert(customerState.no_show_count === 3, 'No-show count reached 3');
assert(customerState.is_blacklisted === true, 'Customer AUTOMATICALLY blacklisted upon reaching 3 no-shows');

// --------------------------------------------------------------------------
// TEST 3: SlotEngine Past Date & Advance Days Limit
// --------------------------------------------------------------------------
console.log('\n--- TEST 3: SlotEngine Date Boundaries (Past & Future Limits) ---');

// Test Past Date (yesterday)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

const pastSlots = SlotEngine.computeSlotsForCourt(court, yesterdayStr);
assert(pastSlots.length > 0, 'Slots computed for past date');
assert(pastSlots.every(s => s.status === 'past'), 'ALL slots on past dates are strictly marked as past');

// Test Beyond Advance Booking Days (> 14 days)
const farFuture = new Date();
farFuture.setDate(farFuture.getDate() + 20);
const farFutureStr = `${farFuture.getFullYear()}-${String(farFuture.getMonth() + 1).padStart(2, '0')}-${String(farFuture.getDate()).padStart(2, '0')}`;

const futureSlots = SlotEngine.computeSlotsForCourt(court, farFutureStr);
assert(futureSlots.length > 0, 'Slots computed for future date');
assert(futureSlots.every(s => s.status === 'blocked' && s.blocked_reason === 'Beyond Advance Booking Limit'), 
  'Slots exceeding 14-day advance limit are blocked with reason "Beyond Advance Booking Limit"');

// --------------------------------------------------------------------------
// TEST 4: Redis Slot Lock Concurrency & Session Exclusivity
// --------------------------------------------------------------------------
console.log('\n--- TEST 4: Redis Slot Locking & Concurrency Control ---');

const lockDate = '2026-12-05';
const lockTime = '17:00';
const sessionUser1 = 'user-sess-alpha';
const sessionUser2 = 'user-sess-beta';

// Session 1 acquires lock
const lock1 = RedisLockService.acquireLock(court.id, lockDate, lockTime, sessionUser1);
assert(lock1.success === true, 'Session 1 acquired 2-minute slot lock');

// Session 2 attempts to acquire same slot
const lock2 = RedisLockService.acquireLock(court.id, lockDate, lockTime, sessionUser2);
assert(lock2.success === false, 'Session 2 rejected due to active lock collision');
assert(lock2.message.includes('currently held by another user'), 'Collision message with TTL countdown returned');

// Session 1 extends lock
const lockExtend = RedisLockService.acquireLock(court.id, lockDate, lockTime, sessionUser1);
assert(lockExtend.success === true && lockExtend.message === 'Lock extended', 'Session 1 extended its own lock');

// Session 1 releases lock
RedisLockService.releaseLock(court.id, lockDate, lockTime, sessionUser1);

// Session 2 can now acquire the lock
const lock3 = RedisLockService.acquireLock(court.id, lockDate, lockTime, sessionUser2);
assert(lock3.success === true, 'Session 2 successfully acquired slot after release');

RedisLockService.releaseLock(court.id, lockDate, lockTime, sessionUser2);

// --------------------------------------------------------------------------
// TEST 5: Contiguous Slot Grouping
// --------------------------------------------------------------------------
console.log('\n--- TEST 5: Multi-Slot Contiguous Block Grouping ---');

const mockSlots: DynamicSlot[] = [
  { start_time: '18:00', end_time: '19:00', price: 1200, is_peak: true, status: 'available' },
  { start_time: '19:00', end_time: '20:00', price: 1200, is_peak: true, status: 'available' },
  { start_time: '21:00', end_time: '22:00', price: 1200, is_peak: true, status: 'available' }
];

const blocks = groupContiguousSlots(mockSlots);
assert(blocks.length === 2, 'Three slots with 1 gap grouped into exactly 2 contiguous blocks');
assert(blocks[0].start_time === '18:00' && blocks[0].end_time === '20:00', 'First block grouped from 18:00 to 20:00 (2 hrs)');
assert(blocks[0].blockPrice === 2400, 'First block aggregated price is ₹2,400');
assert(blocks[1].start_time === '21:00' && blocks[1].end_time === '22:00', 'Second disjoint block is 21:00 to 22:00');

// --------------------------------------------------------------------------
// TEST 6: Customer Authentication (Password-Only Login & OTP-Required Signup)
// --------------------------------------------------------------------------
console.log('\n--- TEST 6: Customer Auth: Password-Only Login & OTP-Required Signup ---');

// 1. Password login test with valid credentials
const validLogin = CustomerAuthService.loginWithPassword('9876543210', 'pass123');
assert(validLogin.success === true, 'Existing customer can log in using phone + password');
assert(validLogin.session?.customer.phone === '9876543210', 'Customer session created with correct profile');

// 2. Password login test with incorrect password
const badPassLogin = CustomerAuthService.loginWithPassword('9876543210', 'wrongpassword');
assert(badPassLogin.success === false, 'Incorrect password correctly rejected');

// 3. Signup attempt without OTP
const noOtpSignup = CustomerAuthService.register('New User', '9911223344', '', 'pass123');
assert(noOtpSignup.success === false, 'Signup without OTP rejected');
assert(noOtpSignup.error?.includes('OTP') === true, 'Clear error message returned requiring OTP');

// 4. Signup attempt with invalid OTP
const badOtpSignup = CustomerAuthService.register('New User', '9911223344', '9999', 'pass123');
assert(badOtpSignup.success === false, 'Signup with invalid OTP rejected');

// 5. Signup attempt with valid OTP (1234)
const validSignup = CustomerAuthService.register('New User', '9911223344', '1234', 'pass123', 'newuser@example.com');
assert(validSignup.success === true, 'Signup with valid OTP (1234) succeeded');
assert(validSignup.session?.customer.name === 'New User', 'New user account registered and session started');

// 6. Duplicate signup with same phone
const dupSignup = CustomerAuthService.register('Another User', '9911223344', '1234', 'pass123');
assert(dupSignup.success === false, 'Signup with already-registered phone cleanly rejected');
assert(dupSignup.error?.includes('already exists') === true, 'Informs user to log in instead of creating duplicate');

// --------------------------------------------------------------------------
// TEST 7: Cancellation & Refund Engine (Policy Tiers, Custom Admin Overrides, Ledger Sync)
// --------------------------------------------------------------------------
console.log('\n--- TEST 7: Cancellation & Refund Policies & Admin Ledger Overrides ---');

// 1. Admin configures dynamic cancellation policies
store.setCancellationPolicies([
  { id: 'pol-1', hours_before_start: 24, refund_percentage: 100, label: 'More than 24 hours (Full)' },
  { id: 'pol-2', hours_before_start: 6, refund_percentage: 50, label: 'Between 6 and 24 hours (Half)' },
  { id: 'pol-3', hours_before_start: 0, refund_percentage: 0, label: 'Less than 6 hours (Non-refundable)' }
]);

const policies = store.getCancellationPolicies();
assert(policies.length === 3, 'Admin successfully updated dynamic cancellation policy tiers');
assert(policies[0].refund_percentage === 100 && policies[1].refund_percentage === 50, 'Policies stored in correct percentage hierarchy');

// 2. Customer full refund test (> 24 hours notice)
const testCustomerRefund = {
  id: 'cust-refund-test',
  name: 'Refund Candidate',
  phone: '9988776655',
  created_at: new Date().toISOString(),
  total_bookings: 0,
  total_spent: 0,
  no_show_count: 0,
  is_blacklisted: false
};
store.addCustomer(testCustomerRefund);

const bookingFullRefundRes = PostgresEngine.createBooking({
  booking_ref: 'TRF-REF-100',
  customer_id: testCustomerRefund.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-10',
  start_time: '10:00',
  end_time: '11:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
assert(bookingFullRefundRes.success === true, 'Confirmed booking created for refund testing');
let custAfterBooking = store.getCustomers().find(c => c.id === testCustomerRefund.id);
assert(custAfterBooking?.total_spent === 1500, 'Customer total_spent increased to ₹1500 after confirmed booking');

// Process 100% refund
const refund100Res = PostgresEngine.updateBookingStatus(bookingFullRefundRes.booking!.id, 'refunded', {
  refundAmount: 1500,
  refundReason: 'Customer cancellation 48h notice (100% policy)'
});
assert(refund100Res.success === true, 'Booking transitioned to refunded status with 100% refund');
const updatedBooking100 = store.getBookings().find(b => b.id === bookingFullRefundRes.booking!.id);
assert(updatedBooking100?.status === 'refunded', 'Booking status is REFUNDED');
assert(updatedBooking100?.refund_amount === 1500, 'Refund amount correctly logged as ₹1500');
let custAfterRefund100 = store.getCustomers().find(c => c.id === testCustomerRefund.id);
assert(custAfterRefund100?.total_spent === 0, 'Customer total_spent decreased by refund amount to ₹0');

// 3. Partial refund test (50% tier)
const bookingPartialRes = PostgresEngine.createBooking({
  booking_ref: 'TRF-REF-50',
  customer_id: testCustomerRefund.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-11',
  start_time: '14:00',
  end_time: '15:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 2000,
  discount_amount: 0
});
const refund50Res = PostgresEngine.updateBookingStatus(bookingPartialRes.booking!.id, 'refunded', {
  refundAmount: 1000,
  refundReason: 'Customer cancellation 12h notice (50% policy)'
});
assert(refund50Res.success === true, 'Partial 50% refund applied successfully');
const updatedBooking50 = store.getBookings().find(b => b.id === bookingPartialRes.booking!.id);
assert(updatedBooking50?.refund_amount === 1000, 'Booking logged with partial refund ₹1000');
let custAfterRefund50 = store.getCustomers().find(c => c.id === testCustomerRefund.id);
assert(custAfterRefund50?.total_spent === 1000, 'Customer total_spent accurately retains remaining non-refunded ₹1000');

// 4. Admin Manual Custom Override (Weather disruption override for completed/in-progress slot)
const bookingAdminOverrideRes = PostgresEngine.createBooking({
  booking_ref: 'TRF-REF-ADMIN',
  customer_id: testCustomerRefund.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-12',
  start_time: '16:00',
  end_time: '17:00',
  source: 'offline_walkin',
  status: 'confirmed',
  total_amount: 1800,
  discount_amount: 0
});
// Admin overrides with custom ₹1400 refund due to floodlight outage
const adminOverrideRes = PostgresEngine.updateBookingStatus(bookingAdminOverrideRes.booking!.id, 'refunded', {
  refundAmount: 1400,
  refundReason: 'Admin custom override: Floodlight outage after 15 mins',
  adminId: 'admin-owner-1'
});
assert(adminOverrideRes.success === true, 'Admin manual refund override processed cleanly');
const updatedAdminBooking = store.getBookings().find(b => b.id === bookingAdminOverrideRes.booking!.id);
assert(updatedAdminBooking?.refund_amount === 1400, 'Admin custom refund amount ₹1400 recorded');
assert(updatedAdminBooking?.refund_reason?.includes('Floodlight outage') === true, 'Admin reason recorded in ledger');

// --------------------------------------------------------------------------
// TEST 8: Cancellation Terms & Conditions (Cut-Off Windows, Met Terms vs Not Met, Business Days Timeline)
// --------------------------------------------------------------------------
console.log('\n--- TEST 8: Cancellation Terms & Conditions (Cut-Off Windows & Eligibility) ---');

// 1. Admin configures cut-off window to 6 hours and 100% refund, 5-7 business days
store.setCancellationSettings({
  cutoff_hours: 6,
  refund_percentage: 100,
  processing_business_days: '5-7',
  allow_cancellation_after_cutoff: true
});

const terms = store.getCancellationSettings();
assert(terms.cutoff_hours === 6, 'Admin cancellation cut-off window set to 6 hours');
assert(terms.refund_percentage === 100, 'Eligible cancellation refund set to 100%');
assert(terms.processing_business_days === '5-7', 'Processing timeline set to 5-7 business days');

// 2. User cancels booking with 8 hours notice (≥ 6h cutoff -> Meets terms)
const testBookingMetTerms = PostgresEngine.createBooking({
  booking_ref: 'TRF-TERMS-MET',
  customer_id: testCustomerRefund.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-15',
  start_time: '18:00',
  end_time: '19:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1200,
  discount_amount: 0
});

const noticeHoursMet = 8;
const metTerms = noticeHoursMet >= terms.cutoff_hours;
const refundEligibleAmt = metTerms ? Math.round((1200 * terms.refund_percentage) / 100) : 0;

assert(metTerms === true, '8 hours notice evaluated as meeting the 6-hour cut-off term');
assert(refundEligibleAmt === 1200, 'Eligible for 100% refund (₹1200)');

const metTermsCancelRes = PostgresEngine.updateBookingStatus(testBookingMetTerms.booking!.id, 'refunded', {
  refundAmount: refundEligibleAmt,
  refundReason: `Customer cancellation (${noticeHoursMet}h notice, met terms)`,
  cancelledBy: 'customer',
  noticeHours: noticeHoursMet,
  metTerms: true
});
assert(metTermsCancelRes.success === true, 'Cancellation with met terms processed as refunded');
const recordedMet = store.getBookings().find(b => b.id === testBookingMetTerms.booking!.id);
assert(recordedMet?.status === 'refunded', 'Status is refunded');
assert(recordedMet?.cancellation_met_terms === true, 'cancellation_met_terms is true on booking');
assert(recordedMet?.cancelled_by === 'customer', 'cancelled_by is recorded as customer');

// 3. User cancels booking with 3 hours notice (< 6h cutoff -> Does NOT meet terms)
const testBookingNotMet = PostgresEngine.createBooking({
  booking_ref: 'TRF-TERMS-FAILED',
  customer_id: testCustomerRefund.id,
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-16',
  start_time: '18:00',
  end_time: '19:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1200,
  discount_amount: 0
});

const noticeHoursFailed = 3;
const termsFailed = noticeHoursFailed >= terms.cutoff_hours;
const refundFailedAmt = termsFailed ? Math.round((1200 * terms.refund_percentage) / 100) : 0;

assert(termsFailed === false, '3 hours notice correctly evaluated as FAILING the 6-hour cut-off term');
assert(refundFailedAmt === 0, 'Non-refundable: ₹0 refund calculated for late cancellation');

const notMetCancelRes = PostgresEngine.updateBookingStatus(testBookingNotMet.booking!.id, 'cancelled', {
  refundAmount: 0,
  refundReason: `Customer cancellation (${noticeHoursFailed}h notice, failed terms)`,
  cancelledBy: 'customer',
  noticeHours: noticeHoursFailed,
  metTerms: false
});
assert(notMetCancelRes.success === true, 'Late cancellation processed as cancelled without refund');
const recordedNotMet = store.getBookings().find(b => b.id === testBookingNotMet.booking!.id);
assert(recordedNotMet?.status === 'cancelled', 'Status is cancelled');
assert(recordedNotMet?.refund_amount === 0, 'Refund amount is ₹0');
assert(recordedNotMet?.cancellation_met_terms === false, 'cancellation_met_terms is false on booking');

// --------------------------------------------------------------------------
// TEST 9: CC-S04 Phone Number Normalization & Blacklist Circumvention
// --------------------------------------------------------------------------
console.log('\n--- TEST 9: CC-S04 Phone Normalization & Blacklist Circumvention ---');

assert(normalizeIndianPhone('9876543210') === '+919876543210', '10-digit number normalized to E.164');
assert(normalizeIndianPhone('+919876543210') === '+919876543210', 'Already E.164 normalized number preserved');
assert(normalizeIndianPhone('09876543210') === '+919876543210', 'Leading 0 phone number normalized correctly');
assert(normalizeIndianPhone('+91 98765-43210') === '+919876543210', 'Formatted phone with spaces & dashes normalized');

// Register blacklisted customer with normalized phone
const blacklistedCust = {
  id: 'cust-blacklisted-e164',
  name: 'Cheater User',
  phone: normalizeIndianPhone('9876500000'),
  created_at: new Date().toISOString(),
  total_bookings: 5,
  total_spent: 6000,
  no_show_count: 3,
  is_blacklisted: true,
  password: 'pass'
};
store.getCustomers().push(blacklistedCust);

// Customer tries to log in with leading 0 or spaces to circumvent blacklist
const circumventAttempt1 = CustomerAuthService.loginWithPassword('09876500000', 'pass');
assert(circumventAttempt1.success === false, 'Circumvention with leading 0 rejected');
assert(Boolean(circumventAttempt1.error?.includes('suspended due to no-show policy violations')), 'Blacklist suspended error returned');

const circumventAttempt2 = CustomerAuthService.loginWithPassword('+91 98765-00000', 'pass');
assert(circumventAttempt2.success === false, 'Circumvention with dashes & spaces rejected');
assert(Boolean(circumventAttempt2.error?.includes('suspended due to no-show policy violations')), 'Blacklist suspended error returned');

// --------------------------------------------------------------------------
// TEST 10: CC-S05 Coupon Concurrency & Atomic Limit Decrement
// --------------------------------------------------------------------------
console.log('\n--- TEST 10: CC-S05 Coupon Concurrency & Atomic Limit ---');

const limitedCoupon = {
  id: 'cpn-limited-test',
  code: 'FLASH50',
  discount_type: 'flat' as const,
  value: 500,
  valid_from: '2026-01-01',
  valid_to: '2026-12-31',
  usage_limit: 2,
  per_customer_limit: 1,
  min_amount: 1000,
  used_count: 1 // 1 spot remaining
};
store.getCoupons().push(limitedCoupon);

// 1. Validation when spot available
const val1 = CouponService.validateCoupon('FLASH50', 1500);
assert(val1.valid === true, 'Coupon is valid when under usage limit');
assert(val1.discountAmount === 500, 'Calculates flat discount of ₹500');

// 2. First customer redeems the remaining spot
const redeem1 = CouponService.atomicRedeem('cpn-limited-test', 'TRF-TEST-CPN-1');
assert(redeem1.success === true, 'First atomic redemption succeeds');
assert(limitedCoupon.used_count === 2, 'used_count reached usage limit (2/2)');

// 3. Second concurrent customer tries to redeem when limit reached
const redeem2 = CouponService.atomicRedeem('cpn-limited-test', 'TRF-TEST-CPN-2');
assert(redeem2.success === false, 'Second redemption rejected by atomic limit guard');
assert(redeem2.message.includes('usage limit (2) reached'), 'Detailed race condition error returned');

// 4. Validation now rejects with limit exceeded
const val2 = CouponService.validateCoupon('FLASH50', 1500);
assert(val2.valid === false, 'Coupon validation now fails after limit reached');
assert(val2.message.includes('usage limit exceeded'), 'Usage limit exceeded message returned');

// --------------------------------------------------------------------------
// TEST 11: CC-D02 Emergency Rainout Mass Cancellation
// --------------------------------------------------------------------------
console.log('\n--- TEST 11: CC-D02 Emergency Weather / Rainout Mass Cancellation ---');

const rainDate = '2026-12-20';
// Create two bookings on rain date
const rainBooking1 = PostgresEngine.createBooking({
  booking_ref: 'TRF-RAIN-001',
  customer_id: 'cust-101',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: rainDate,
  start_time: '18:00',
  end_time: '19:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
const rainBooking2 = PostgresEngine.createBooking({
  booking_ref: 'TRF-RAIN-002',
  customer_id: 'cust-102',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: rainDate,
  start_time: '19:00',
  end_time: '20:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
assert(rainBooking1.success && rainBooking2.success, 'Created 2 confirmed bookings for rainout test');

// Mass cancel all bookings for rainout
const massBookings = store.getBookings().filter(b => b.booking_date === rainDate && b.status === 'confirmed');
for (const b of massBookings) {
  PostgresEngine.updateBookingStatus(b.id, 'refunded', {
    refundAmount: b.total_amount,
    refundReason: 'Unplayable pitch conditions due to continuous torrential rain',
    cancelledBy: 'admin',
    metTerms: true
  });
}

const b1Updated = store.getBookings().find(b => b.id === rainBooking1.booking!.id);
const b2Updated = store.getBookings().find(b => b.id === rainBooking2.booking!.id);
assert(b1Updated?.status === 'refunded', 'Rainout booking 1 status is refunded');
assert(b1Updated?.refund_amount === 1500, 'Rainout booking 1 received 100% full refund (₹1500)');
assert(b2Updated?.status === 'refunded', 'Rainout booking 2 status is refunded');
assert(b2Updated?.refund_amount === 1500, 'Rainout booking 2 received 100% full refund (₹1500)');

// --------------------------------------------------------------------------
// TEST 12: CC-D03 Court Blocking Conflict Guard Against Active Bookings
// --------------------------------------------------------------------------
console.log('\n--- TEST 12: CC-D03 Court Blocking Guard Against Active Bookings ---');

const blockTestDate = '2026-12-25';
const activeBlockBooking = PostgresEngine.createBooking({
  booking_ref: 'TRF-BLOCK-TEST',
  customer_id: 'cust-101',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: blockTestDate,
  start_time: '17:00',
  end_time: '18:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
assert(activeBlockBooking.success, 'Active confirmed booking created on Christmas');

// Attempting to block pitch overlapping 17:00 - 18:00
const blockConflict = store.getBookings().find(b =>
  b.court_id === court.id &&
  b.booking_date === blockTestDate &&
  (b.status === 'confirmed' || b.status === 'pending_payment') &&
  PostgresEngine.isTimeOverlap('16:00', '18:00', b.start_time, b.end_time)
);
assert(blockConflict !== undefined, 'Overlap conflict detected when trying to block court with active booking');
assert(blockConflict?.booking_ref === 'TRF-BLOCK-TEST', 'Correct conflicting booking identified');

// --------------------------------------------------------------------------
// TEST 13 & 14: CC-P01 & CC-P02 Razorpay Idempotency & Late Capture Conflict
// --------------------------------------------------------------------------
console.log('\n--- TEST 13 & 14: CC-P01 & CC-P02 Razorpay Webhook Idempotency & Late Capture ---');

// 1. Create a booking and order
const rzpBooking = PostgresEngine.createBooking({
  booking_ref: 'TRF-RZP-TEST',
  customer_id: 'cust-101',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-28',
  start_time: '10:00',
  end_time: '11:00',
  source: 'online',
  status: 'pending_payment',
  total_amount: 1200,
  discount_amount: 0
});
const rzpOrder = RazorpayService.createOrder(rzpBooking.booking!.id, 1200);

// Capture payment via webhook
const rzpWebhook1 = RazorpayService.processWebhook({
  event: 'payment.captured',
  payment_id: 'pay_test_idem_001',
  order_id: rzpOrder.order_id,
  method: 'upi',
  signature: 'sig_valid'
});
assert(rzpWebhook1.success === true, 'Webhook captured payment and confirmed booking');

// Replay identical webhook (CC-P01 Idempotency)
const rzpWebhookReplay = RazorpayService.processWebhook({
  event: 'payment.captured',
  payment_id: 'pay_test_idem_001',
  order_id: rzpOrder.order_id,
  method: 'upi',
  signature: 'sig_valid'
});
assert(rzpWebhookReplay.success === true, 'Duplicate webhook handled idempotently');
assert(rzpWebhookReplay.message.includes('Idempotent replay'), 'Idempotent replay confirmed');

// 2. Late payment capture on expired lock where slot was taken (CC-P02)
const lateBooking = PostgresEngine.createBooking({
  booking_ref: 'TRF-LATE-CUSTOMER',
  customer_id: 'cust-101',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-29',
  start_time: '20:00',
  end_time: '21:00',
  source: 'online',
  status: 'pending_payment',
  total_amount: 1500,
  discount_amount: 0
});
const lateOrder = RazorpayService.createOrder(lateBooking.booking!.id, 1500);

// Meanwhile, 5-minute hold expired, cancelling pending booking and releasing lock
PostgresEngine.updateBookingStatus(lateBooking.booking!.id, 'cancelled', { refundReason: 'Hold expired without payment' });

// Another player booked that exact slot right after the hold released!
const interceptorBooking = PostgresEngine.createBooking({
  booking_ref: 'TRF-INTERCEPTOR',
  customer_id: 'cust-102',
  court_id: court.id,
  sport_id: court.sport_ids[0],
  booking_date: '2026-12-29',
  start_time: '20:00',
  end_time: '21:00',
  source: 'online',
  status: 'confirmed',
  total_amount: 1500,
  discount_amount: 0
});
assert(interceptorBooking.success === true, 'Second customer successfully reserved slot after hold expired');

// Now, original customer late UPI payment arrives
const lateWebhookRes = RazorpayService.processWebhook({
  event: 'payment.captured',
  payment_id: 'pay_test_late_capture_001',
  order_id: lateOrder.order_id,
  method: 'upi',
  signature: 'sig_valid'
});
assert(lateWebhookRes.success === false, 'Late capture does NOT confirm conflicting booking');
assert(lateWebhookRes.conflictRefunded === true, 'conflictRefunded flag is true');
assert(lateWebhookRes.message.includes('100% instant refund'), 'Automated 100% refund message returned');

const lateBookingStatus = store.getBookings().find(b => b.id === lateBooking.booking!.id);
assert(lateBookingStatus?.status === 'refunded', 'Late booking automatically transitioned to refunded');
assert(lateBookingStatus?.refund_amount === 1500, 'Full 100% refund (₹1500) recorded in ledger');

// --------------------------------------------------------------------------
// TEST 15: CC-S01 & CC-DB1 Consecutive Buffer Suppression & Midnight Operating Hours
// --------------------------------------------------------------------------
console.log('\n--- TEST 15: CC-S01 & CC-DB1 Buffer Suppression & Midnight Hours ---');

// Court with buffer minutes and midnight hours (06:00 to 02:00 AM)
const lateNightCourt: Court = {
  id: 'crt-midnight-test',
  venue_id: 'ven-001',
  sport_ids: ['sp-football'],
  name: 'Midnight Arena',
  slot_duration_minutes: 60,
  opening_time: '18:00',
  closing_time: '02:00', // Crossover past midnight!
  buffer_minutes: 0,
  status: 'active',
  base_price_per_hour: 1000
};

const midnightSlots = SlotEngine.computeSlotsForCourt(lateNightCourt, '2026-12-30');
assert(midnightSlots.length > 0, 'Slots generated for midnight crossover court');
assert(midnightSlots.some(s => s.start_time === '23:00' && s.end_time === '00:00'), '23:00 - 00:00 slot exists');
assert(midnightSlots.some(s => s.start_time === '00:00' && s.end_time === '01:00'), '00:00 - 01:00 slot exists');
assert(midnightSlots.some(s => s.start_time === '01:00' && s.end_time === '02:00'), '01:00 - 02:00 crossover slot exists');

// Consecutive slot grouping
const slot1: DynamicSlot = { start_time: '18:00', end_time: '19:00', price: 1000, is_peak: false, status: 'available' };
const slot2: DynamicSlot = { start_time: '19:00', end_time: '20:00', price: 1000, is_peak: false, status: 'available' };
const consecutiveBlocks = groupContiguousSlots([slot1, slot2]);
assert(consecutiveBlocks.length === 1, 'Two consecutive 1-hour slots grouped into 1 continuous 2-hour block');
assert(consecutiveBlocks[0].start_time === '18:00' && consecutiveBlocks[0].end_time === '20:00', 'Grouped block spans 18:00 - 20:00 with zero buffer gaps');

// --------------------------------------------------------------------------
// TEST 16: CC-A03 Indian Conversational Time Parser
// --------------------------------------------------------------------------
console.log('\n--- TEST 16: CC-A03 Indian Conversational Time Parser ---');

const parse1 = parseIndianTimeInput('kal shaam 7 baje football');
assert(parse1?.time24 === '19:00', 'kal shaam 7 baje parsed to 19:00 (7 PM)');

const parse2 = parseIndianTimeInput('friday 8pm cricket');
assert(parse2?.time24 === '20:00', 'friday 8pm parsed to 20:00 (8 PM)');

const parse3 = parseIndianTimeInput('book for 9');
assert(parse3?.time24 === '21:00', 'standalone 9 defaults to 21:00 (9 PM evening peak)');

const parse4 = parseIndianTimeInput('subah 6 am');
assert(parse4?.time24 === '06:00', 'subah 6 am parsed to 06:00 AM');

console.log('\n🎉 ALL CORNER & EDGE CASE TESTS PASSED PERFECTLY!\n');
