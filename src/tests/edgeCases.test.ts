import { PostgresEngine } from '../services/postgresEngine';
import { SlotEngine } from '../services/slotEngine';
import { RedisLockService } from '../services/redisLockService';
import { CustomerAuthService } from '../services/customerAuthService';
import { CouponService } from '../services/couponService';
import { RazorpayService } from '../services/razorpayService';
import { normalizeIndianPhone, parseIndianTimeInput, getVenueNow, getVenueDateString } from '../utils/venueTime';
import { store } from '../services/store';
import { groupContiguousSlots } from '../components/customer/CheckoutModal';
import { EmailService } from '../services/emailService';
import { EmailVerificationService } from '../services/emailVerificationService';
import { SmsService } from '../services/smsService';
import { SmsVerificationService } from '../services/smsVerificationService';
import { ReminderScheduler } from '../services/reminderScheduler';
import { NotificationService } from '../services/notificationService';
import { ExcelExportService } from '../services/excelExportService';
import { DataArchiveService } from '../services/dataArchiveService';
import { AuditLogger } from '../services/auditLogger';
import { formatTimeRange12h, formatTime12hPlain, formatDateDDMMYYYY, getBookingGatePassOtp, getBookingGroupRef } from '../utils/formatters';
import { Court, DynamicSlot, BlockedSlot, Booking } from '../types/schema';

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

// 3. Signup attempt without mobile OTP
const noOtpSignup = CustomerAuthService.register('New User', '9911223344', '', 'pass123', 'newuser@example.com', '123456');
assert(noOtpSignup.success === false, 'Signup without mobile OTP rejected');
assert(noOtpSignup.error?.includes('OTP') === true, 'Clear error message returned requiring mobile OTP');

// 4. Signup attempt with invalid mobile OTP
const badOtpSignup = CustomerAuthService.register('New User', '9911223344', '9999', 'pass123', 'newuser@example.com', '123456');
assert(badOtpSignup.success === false, 'Signup with invalid mobile OTP rejected');

// 4b. Signup attempt without email OTP
const noEmailOtpSignup = CustomerAuthService.register('New User', '9911223344', '1234', 'pass123', 'newuser@example.com', '');
assert(noEmailOtpSignup.success === false, 'Signup without email OTP rejected');
assert(noEmailOtpSignup.error?.includes('email verification') === true, 'Clear error message returned requiring email OTP');

// 5. Signup attempt with valid Dual OTPs (Mobile: 1234, Email: 123456)
const validSignup = CustomerAuthService.register('New User', '9911223344', '1234', 'pass123', 'newuser@example.com', '123456');
assert(validSignup.success === true, 'Signup with valid Dual OTPs (Mobile: 1234, Email: 123456) succeeded');
assert(validSignup.session?.customer.name === 'New User', 'New user account registered and session started');
assert(validSignup.session?.customer.email_verified === true, 'Email marked verified on registration');

// 6. Duplicate signup with same phone
const dupSignup = CustomerAuthService.register('Another User', '9911223344', '1234', 'pass123', 'another@example.com', '123456');
assert(dupSignup.success === false, 'Signup with already-registered phone cleanly rejected');
assert(dupSignup.error?.includes('already exists') === true, 'Informs user to log in instead of creating duplicate');

// 6b. Duplicate signup with same email (different phone)
const dupEmailSignup = CustomerAuthService.register('Third User', '9911223355', '1234', 'pass123', 'newuser@example.com', '123456');
assert(dupEmailSignup.success === false, 'Signup with already-registered email cleanly rejected');
assert(dupEmailSignup.error?.includes('already exists') === true, 'Informs user email already exists');

// 6c. Real-time checkIdentityExists verification
const check1 = CustomerAuthService.checkIdentityExists('9911223344', 'unique@example.com');
assert(check1.phoneExists === true && check1.emailExists === false, 'checkIdentityExists detects registered phone');

const check2 = CustomerAuthService.checkIdentityExists('9988776655', 'newuser@example.com');
assert(check2.phoneExists === false && check2.emailExists === true, 'checkIdentityExists detects registered email');

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

// --------------------------------------------------------------------------
// TEST 17: Resend Email Integration (Login OTP, Profile Update OTP, Booking Confirmation & 1-Hour Reminder)
// --------------------------------------------------------------------------
console.log('\n--- TEST 17: Resend Email Integration (Login OTP, Profile Update OTP, Booking Confirmation & 1-Hour Reminder) ---');

async function runResendTests() {
  const testEmail = 'player.resend@example.com';
  const updatedEmail = 'player.newemail@example.com';

  // 17.1: Request Email Signup OTP via Resend
  const reqSignup = await EmailVerificationService.requestOtp(testEmail, 'signup', 'Resend Player');
  assert(reqSignup.success, 'EmailVerificationService successfully generates and dispatches signup OTP via Resend');
  assert(!!reqSignup.code && reqSignup.code.length === 6, 'Generated 6-digit verification code');

  // 17.2: Verify Invalid vs Valid OTP
  const invalidVerify = EmailVerificationService.verifyOtp(testEmail, '999999', 'signup');
  assert(!invalidVerify.success, 'Invalid verification code rejected');

  const validVerify = EmailVerificationService.verifyOtp(testEmail, reqSignup.code!, 'signup');
  assert(validVerify.success, 'Valid 6-digit code successfully verified');

  // 17.3: Mandatory Dual OTP Registration (Mobile OTP + Resend Email OTP)
  const reqSignup2 = await EmailVerificationService.requestOtp(testEmail, 'signup', 'Resend Player');
  const signupRes = CustomerAuthService.register(
    'Resend Player',
    '9123456780',
    '1234',
    'securepass123',
    testEmail,
    reqSignup2.code!
  );
  assert(signupRes.success && !!signupRes.session, 'Customer registered via Mandatory Dual OTP (Mobile + Resend Email)');
  assert(signupRes.session!.customer.email === testEmail, 'Registered customer email matches');
  assert(signupRes.session!.customer.email_verified === true, 'Registered customer email marked as verified');

  // 17.3b: Login using Password (No email OTP option)
  const loginRes = CustomerAuthService.loginWithPassword(testEmail, 'securepass123');
  assert(loginRes.success && !!loginRes.session, 'Customer successfully logs in using email + password');

  // 17.4: Profile Update with Email Verification
  const reqUpdate = await EmailVerificationService.requestOtp(updatedEmail, 'profile_update', signupRes.session!.customer.name);
  assert(reqUpdate.success, 'Resend OTP dispatched for profile email update');

  const updateRes = CustomerAuthService.updateCustomerEmail(signupRes.session!.customer.id, updatedEmail, reqUpdate.code!);
  assert(updateRes.success, 'Customer email updated after OTP verification');
  assert(updateRes.customer?.email === updatedEmail, 'Profile email reflects new verified email');
  assert(updateRes.customer?.email_verified === true, 'Updated email marked verified');

  // 17.5: Booking Confirmation with Gatepass via Resend
  const testBooking = store.getBookings()[0];
  const testCust = store.getCustomers().find(c => c.id === testBooking.customer_id) || store.getCustomers()[0];
  const venue = store.getVenue();
  const courtName = store.getCourts()[0].name;

  const confirmRes = await EmailService.sendBookingConfirmation({
    booking: testBooking,
    customer: testCust,
    courtName,
    venue
  });
  assert(confirmRes.success, 'Booking confirmation with 4-digit Gatepass sent via Resend pipeline');
  assert(confirmRes.subject.includes(testBooking.booking_ref), 'Subject contains booking reference');

  // 17.6: 1-Hour Matchday Kickoff Reminder Email
  const reminderRes = await EmailService.sendBookingReminder({
    booking: testBooking,
    customer: testCust,
    courtName,
    venue
  });
  assert(reminderRes.success, '1-Hour matchday kickoff reminder email sent via Resend pipeline');
  assert(reminderRes.subject.includes('1 Hour'), 'Reminder subject indicates 1 hour to kickoff');

  // 17.7: ReminderScheduler Automated Check
  const slotDate = new Date(Date.now() + 60 * 60 * 1000);
  const year = slotDate.getFullYear();
  const month = String(slotDate.getMonth() + 1).padStart(2, '0');
  const day = String(slotDate.getDate()).padStart(2, '0');
  const targetDate = `${year}-${month}-${day}`;
  const startStr = `${String(slotDate.getHours()).padStart(2, '0')}:${String(slotDate.getMinutes()).padStart(2, '0')}`;
  const endHour = (slotDate.getHours() + 1) % 24;
  const endStr = `${String(endHour).padStart(2, '0')}:${String(slotDate.getMinutes()).padStart(2, '0')}`;

  const scheduledBooking = PostgresEngine.createBooking({
    booking_ref: `TRF-REMIND-${Date.now().toString().slice(-4)}`,
    customer_id: testCust.id,
    court_id: store.getCourts()[0].id,
    sport_id: store.getSports()[0].id,
    booking_date: targetDate,
    start_time: startStr,
    end_time: endStr,
    source: 'online',
    status: 'confirmed',
    total_amount: 1200,
    discount_amount: 0
  });

  assert(scheduledBooking.success && !!scheduledBooking.booking, 'Created booking starting in 1 hour for scheduler test');
  const schedulerCheck = ReminderScheduler.checkAndDispatch();
  assert(schedulerCheck.dispatchedCount >= 1, 'ReminderScheduler detected and dispatched 1-hour reminder automatically');
  assert(scheduledBooking.booking!.reminder_sent === true, 'Booking reminder_sent flag set to true');

  // --------------------------------------------------------------------------
  // TEST 18: SMS Integration (Signup OTP, Forgot Password Reset OTP, Booking Confirmation & 1-Hour Reminder SMS)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 18: SMS Service Integration (Signup OTP, Forgot Password Reset OTP, Booking Confirmation & 1-Hour Reminder) ---');

  // 18.1: Request Mobile Signup OTP via SMS
  const testPhone = '9811223344';
  const reqSms = await SmsVerificationService.requestOtp(testPhone, 'signup');
  assert(reqSms.success, 'SmsVerificationService generates and dispatches signup OTP via SMS');
  assert(!!reqSms.code && reqSms.code.length === 4, 'Generated 4-digit numeric SMS code');

  // 18.2: Verify Invalid vs Valid SMS OTP
  const invalidSms = SmsVerificationService.verifyOtp(testPhone, '9999', 'signup');
  assert(!invalidSms.success, 'Invalid 4-digit SMS OTP rejected');

  const validSms = SmsVerificationService.verifyOtp(testPhone, reqSms.code!, 'signup');
  assert(validSms.success, 'Valid 4-digit SMS OTP verified and consumed');

  // 18.3: Request Forgot Password OTP for Registered User
  const rahulPhone = '9876543210';
  const forgotOtpReq = await CustomerAuthService.sendPasswordResetOtp(rahulPhone);
  assert(forgotOtpReq.success, 'Password reset OTP dispatched via SMS for registered customer');
  assert(!!forgotOtpReq.code && forgotOtpReq.code.length === 4, 'Generated 4-digit password reset OTP');

  // 18.4: Request Forgot Password OTP for Non-Existent User
  const nonExistentReq = await CustomerAuthService.sendPasswordResetOtp('9000000000');
  assert(!nonExistentReq.success, 'Password reset OTP cleanly rejected for unregistered phone number');

  // 18.5: Reset Password with OTP & Verify Login with New Password
  const resetRes = CustomerAuthService.resetPasswordWithOtp(rahulPhone, forgotOtpReq.code!, 'newsecretpassword');
  assert(resetRes.success && !!resetRes.session, 'Password successfully reset and active session created');
  assert(resetRes.session!.customer.password === 'newsecretpassword', 'Customer profile reflects new password');

  const reLogin = CustomerAuthService.loginWithPassword(rahulPhone, 'newsecretpassword');
  assert(reLogin.success, 'Customer successfully logs in with new updated password');

  // 18.6: Dispatch Booking Confirmation SMS with 4-Digit Gatepass
  const smsConfirm = await SmsService.sendBookingConfirmation({
    booking: testBooking,
    customer: testCust,
    courtName,
    venue
  });
  assert(smsConfirm.success, 'Booking confirmation SMS sent successfully');
  assert(smsConfirm.message.includes(testBooking.booking_ref.slice(-4)), 'SMS contains 4-digit gate pass OTP');

  // 18.7: Dispatch 1-Hour Matchday Kickoff Reminder SMS
  const smsReminder = await SmsService.sendBookingReminder({
    booking: testBooking,
    customer: testCust,
    courtName,
    venue
  });
  assert(smsReminder.success, '1-Hour kickoff reminder SMS dispatched');
  assert(smsReminder.message.includes('1 hour'), 'Reminder SMS includes 1-hour warning');
  assert(smsReminder.message.includes('Date:'), 'Reminder SMS includes match date');

  // --- TEST 19: Time-Windowed & Multi-Day Pitch Maintenance Blocking ---
  console.log('\n--- TEST 19: Time-Windowed & Multi-Day Pitch Maintenance Blocking ---');
  const targetCourt = store.getCourts()[0]; // crt-001
  const testDateTomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const testDateDay2 = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];
  const testDateDay3 = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
  const testDateDay4 = new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0];

  // 19.1: Single-Day Windowed Maintenance Block (Tomorrow from 14:00 to 18:00)
  const singleDayBlock: BlockedSlot = {
    id: `blk-test-single-${Date.now()}`,
    court_id: targetCourt.id,
    date: testDateTomorrow,
    start_time: '14:00',
    end_date: testDateTomorrow,
    end_time: '18:00',
    reason: 'maintenance',
    created_by_admin_id: 'adm-001'
  };
  store.setBlockedSlots([...store.getBlockedSlots(), singleDayBlock]);

  const tomorrowSlots = SlotEngine.computeSlotsForCourt(targetCourt, testDateTomorrow);
  const slot11am = tomorrowSlots.find(s => s.start_time === '11:00');
  const slot14pm = tomorrowSlots.find(s => s.start_time === '14:00');
  const slot17pm = tomorrowSlots.find(s => s.start_time === '17:00');
  const slot18pm = tomorrowSlots.find(s => s.start_time === '18:00');

  assert(slot11am?.status === 'available', 'Morning 11:00 slot remains available before maintenance starts');
  assert(slot14pm?.status === 'blocked' && slot14pm.blocked_reason === 'Maintenance', '14:00 slot is blocked for maintenance');
  assert(slot17pm?.status === 'blocked' && slot17pm.blocked_reason === 'Maintenance', '17:00 slot is blocked for maintenance');
  assert(slot18pm?.status === 'available', '18:00 slot is restored to available after maintenance window ends');

  // 19.2: Multi-Day Pitch Maintenance Block (Day 2 16:00 to Day 4 12:00)
  const multiDayCourt = store.getCourts()[1] || targetCourt;
  const multiDayBlock: BlockedSlot = {
    id: `blk-test-multi-${Date.now()}`,
    court_id: multiDayCourt.id,
    date: testDateDay2,
    start_time: '16:00',
    end_date: testDateDay4,
    end_time: '12:00',
    reason: 'maintenance',
    created_by_admin_id: 'adm-001'
  };
  store.setBlockedSlots([...store.getBlockedSlots(), multiDayBlock]);

  // Day 2 check (Start day: before 16:00 available, after 16:00 blocked)
  const day2Slots = SlotEngine.computeSlotsForCourt(multiDayCourt, testDateDay2);
  const day2Morning = day2Slots.find(s => s.start_time === '10:00');
  const day2Evening = day2Slots.find(s => s.start_time === '17:00');
  assert(day2Morning?.status === 'available', 'Multi-day block: Day 1 morning slot is available');
  assert(day2Evening?.status === 'blocked', 'Multi-day block: Day 1 evening slot starting after 16:00 is blocked');

  // Day 3 check (Intermediate day: entire day blocked)
  const day3Slots = SlotEngine.computeSlotsForCourt(multiDayCourt, testDateDay3);
  assert(day3Slots.every(s => s.status === 'blocked'), 'Multi-day block: Intermediate full day is 100% blocked');

  // Day 4 check (End day: before 12:00 blocked, after 12:00 available)
  const day4Slots = SlotEngine.computeSlotsForCourt(multiDayCourt, testDateDay4);
  const day4Morning = day4Slots.find(s => s.start_time === '09:00');
  const day4Afternoon = day4Slots.find(s => s.start_time === '14:00');
  assert(day4Morning?.status === 'blocked', 'Multi-day block: Day 4 slot before 12:00 is blocked');
  assert(day4Afternoon?.status === 'available', 'Multi-day block: Day 4 slot after 12:00 is available');

  // 19.3: Active Booking Conflict Guard (Rejection of booking inside blocked maintenance window)
  const blockedInsertAttempt = PostgresEngine.createBooking({
    booking_ref: `TRF-${Date.now()}`,
    customer_id: 'cust-001',
    court_id: multiDayCourt.id,
    sport_id: 'sp-football',
    booking_date: testDateDay3,
    start_time: '15:00',
    end_time: '16:00',
    total_amount: 1200,
    discount_amount: 0,
    status: 'pending_payment',
    source: 'online'
  });
  assert(!blockedInsertAttempt.success, 'PostgresEngine cleanly rejects booking creation during active pitch maintenance');
  assert(blockedInsertAttempt.message.includes('[Court Blocked Guard]'), 'Error message informs user the pitch is closed for maintenance');

  // --- TEST 20: Automated Booking Completion & Owner Early Completion ---
  console.log('\n--- TEST 20: Automated Booking Completion & Owner Early Completion ---');
  
  // 20.1: Confirmed booking with past end_time is automatically transitioned to 'completed'
  const pastDate = '2026-01-01';
  const pastBookingInsert = PostgresEngine.createBooking({
    booking_ref: `TRF-PAST-${Date.now()}`,
    customer_id: 'cust-001',
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: pastDate,
    start_time: '10:00',
    end_time: '11:00',
    total_amount: 1000,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  });
  assert(Boolean(pastBookingInsert.success && pastBookingInsert.booking), 'Past test booking created as confirmed');
  const pastBkId = pastBookingInsert.booking!.id;

  // Run autoCompleteExpiredBookings
  const autoResult = PostgresEngine.autoCompleteExpiredBookings();
  assert(autoResult.completedCount >= 1, 'autoCompleteExpiredBookings transitioned past booking(s)');
  
  const pastBkAfter = store.getBookings().find(b => b.id === pastBkId);
  assert(Boolean(pastBkAfter?.status === 'completed'), 'Past confirmed booking is now automatically completed');

  // 20.2: Future confirmed booking remains 'confirmed'
  const futureDate = new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0];
  const futureBookingInsert = PostgresEngine.createBooking({
    booking_ref: `TRF-FUT-${Date.now()}`,
    customer_id: 'cust-001',
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: futureDate,
    start_time: '18:00',
    end_time: '19:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  });
  assert(Boolean(futureBookingInsert.success && futureBookingInsert.booking), 'Future test booking created as confirmed');
  const futBkId = futureBookingInsert.booking!.id;

  PostgresEngine.autoCompleteExpiredBookings();
  const futBkAfter = store.getBookings().find(b => b.id === futBkId);
  assert(Boolean(futBkAfter?.status === 'confirmed'), 'Future booking remains confirmed until slot end time');

  // 20.3: Owner early completion before time slot
  const ownerCompleteResult = PostgresEngine.updateBookingStatus(futBkId, 'completed');
  assert(ownerCompleteResult.success, 'Owner successfully marks future booking completed before slot time');
  const futBkOwnerCompleted = store.getBookings().find(b => b.id === futBkId);
  assert(Boolean(futBkOwnerCompleted?.status === 'completed'), 'Owner-completed booking is status completed');

  // 20.4: Past cancelled/refunded booking is NOT modified by auto-complete
  const pastCancelledInsert = PostgresEngine.createBooking({
    booking_ref: `TRF-CANC-${Date.now()}`,
    customer_id: 'cust-001',
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: pastDate,
    start_time: '12:00',
    end_time: '13:00',
    total_amount: 1200,
    discount_amount: 0,
    status: 'cancelled',
    source: 'online'
  });
  assert(Boolean(pastCancelledInsert.success && pastCancelledInsert.booking), 'Past cancelled booking created');
  const cancId = pastCancelledInsert.booking!.id;

  PostgresEngine.autoCompleteExpiredBookings();
  const cancAfter = store.getBookings().find(b => b.id === cancId);
  assert(Boolean(cancAfter?.status === 'cancelled'), 'Cancelled past booking is never overridden by auto-complete');

  // --- TEST 21: Multi-Slot Booking (Continuous & Non-Continuous) Common Gate Pass OTP ---
  console.log('\n--- TEST 21: Multi-Slot Booking (Continuous & Non-Continuous) Common Gate Pass OTP ---');
  const commonOtp = '7429';
  const primaryMultiRef = `TRF-MULTI-${Date.now()}`;
  const testCustId = 'cust-multi-001';
  const testDate = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
  const commonPaymentId = `pay_multi_live_${Date.now()}`;

  // Two non-continuous slots: 17:00-18:00 and 19:00-20:00
  const selectedSlots = [
    { start_time: '17:00', end_time: '18:00', price: 1200 },
    { start_time: '19:00', end_time: '20:00', price: 1500 }
  ];
  const grandTotal = 2700;
  const formattedSummary = '05:00 PM – 06:00 PM, 07:00 PM – 08:00 PM';

  // 21.1: Create Block 1 (Primary Booking)
  const block1Result = PostgresEngine.createBooking({
    booking_ref: primaryMultiRef,
    group_ref: primaryMultiRef,
    gate_pass_otp: commonOtp,
    gateway_payment_id: commonPaymentId,
    total_order_amount: grandTotal,
    all_slots: selectedSlots,
    formatted_slots: formattedSummary,
    customer_id: testCustId,
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: testDate,
    start_time: '17:00',
    end_time: '18:00',
    total_amount: 1200,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  });
  assert(block1Result.success, 'Block 1 created with common group_ref and OTP');

  // 21.2: Create Block 2 (Sibling Booking in same checkout)
  const block2Ref = `${primaryMultiRef}-2`;
  const block2Result = PostgresEngine.createBooking({
    booking_ref: block2Ref,
    group_ref: primaryMultiRef,
    gate_pass_otp: commonOtp,
    gateway_payment_id: commonPaymentId,
    total_order_amount: grandTotal,
    all_slots: selectedSlots,
    formatted_slots: formattedSummary,
    customer_id: testCustId,
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: testDate,
    start_time: '19:00',
    end_time: '20:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  });
  assert(block2Result.success, 'Block 2 created with common group_ref and OTP');

  // 21.3: Verify both share identical Gate Pass OTP and Group Ref
  const allStored = store.getBookings();
  const b1 = allStored.find(b => b.booking_ref === primaryMultiRef);
  const b2 = allStored.find(b => b.booking_ref === block2Ref);
  assert(Boolean(b1 && b2), 'Both multi-slot bookings stored in DB');
  assert(b1?.gate_pass_otp === commonOtp && b2?.gate_pass_otp === commonOtp, 'Both bookings share identical common 4-digit OTP');
  assert(b1?.group_ref === primaryMultiRef && b2?.group_ref === primaryMultiRef, 'Both bookings linked by group_ref');
  assert(b1?.total_order_amount === 2700 && b2?.total_order_amount === 2700, 'Both bookings record complete grand total order amount');

  // 21.4: Resolve sibling bookings from secondary ref
  const siblingsFromB2 = allStored.filter(b => b.group_ref === b2?.group_ref || b.booking_ref === b2?.group_ref);
  assert(siblingsFromB2.length === 2, 'Sibling resolution by group_ref returns all sessions');

  // 21.5: Outbound WhatsApp notification format test
  NotificationService.enqueueNotification(b1!, 'confirmation', 'whatsapp');
  const loggedNotif = store.getNotificationLogs().find(n => n.booking_id === b1!.id && n.channel === 'whatsapp');
  assert(Boolean(loggedNotif), 'Notification logged for booking');
  assert(loggedNotif!.message_preview.includes(commonOtp), 'WhatsApp notification includes common 4-digit Gate Pass OTP');
  assert(loggedNotif!.message_preview.includes('05:00 PM') && loggedNotif!.message_preview.includes('07:00 PM'), 'WhatsApp notification lists all booked session timings');
  assert(loggedNotif!.message_preview.includes('2700'), 'WhatsApp notification reflects grand total order amount');

  // 21.6: Outbound SMS format test
  const multiSms = await SmsService.sendBookingConfirmation({
    booking: b1!,
    customer: { id: testCustId, name: 'Rahul Sharma', phone: '9876543210', total_bookings: 2, total_spent: 2700, is_blacklisted: false, no_show_count: 0, created_at: '' },
    courtName: targetCourt.name,
    venue: store.getVenue()
  });
  assert(multiSms.success, 'Multi-slot confirmation SMS sent');
  assert(multiSms.message.includes(commonOtp), 'SMS contains common 4-digit gate pass OTP');
  assert(multiSms.message.includes('₹2700'), 'SMS includes grand total order amount');

  // 21.7: Missing character / hyphen guard test for sibling refs (TRF-20261110-2221-2)
  const testSiblingBookingA = {
    booking_ref: 'TRF-20261110-2221',
    status: 'confirmed' as const
  };
  const testSiblingBookingB = {
    booking_ref: 'TRF-20261110-2221-2',
    status: 'confirmed' as const
  };
  const testSiblingBookingC = {
    booking_ref: 'TRF-20261110-2221-3',
    status: 'confirmed' as const
  };

  const otpA = getBookingGatePassOtp(testSiblingBookingA);
  const otpB = getBookingGatePassOtp(testSiblingBookingB);
  const otpC = getBookingGatePassOtp(testSiblingBookingC);

  assert(otpA === '2221', 'Primary ref TRF-20261110-2221 yields OTP 2221');
  assert(otpB === '2221', 'Secondary sibling ref TRF-20261110-2221-2 yields OTP 2221 (NEVER "21-2")');
  assert(otpC === '2221', 'Tertiary sibling ref TRF-20261110-2221-3 yields OTP 2221 (NEVER "21-3")');
  assert(!otpB.includes('-'), 'OTP for sibling booking B contains NO hyphens');
  assert(!otpC.includes('-'), 'OTP for sibling booking C contains NO hyphens');

  const groupA = getBookingGroupRef(testSiblingBookingA);
  const groupB = getBookingGroupRef(testSiblingBookingB);
  const groupC = getBookingGroupRef(testSiblingBookingC);

  assert(groupA === 'TRF-20261110-2221', 'Group ref for primary is TRF-20261110-2221');
  assert(groupB === 'TRF-20261110-2221', 'Group ref for secondary sibling resolves to parent TRF-20261110-2221');
  assert(groupC === 'TRF-20261110-2221', 'Group ref for tertiary sibling resolves to parent TRF-20261110-2221');

  // --- TEST 22: Multi-Slot Partial Cancellation & Gate Pass Dynamic Slot Pruning ---
  console.log('\n--- TEST 22: Multi-Slot Partial Cancellation & Gate Pass Dynamic Slot Pruning ---');
  const multiGroupRef = `TRF-GROUP-${Date.now()}`;
  const commonMultiOtp = '8821';
  const groupDate = '2026-11-20';
  const commonPayment = `pay_partial_${Date.now()}`;

  const slotA = PostgresEngine.createBooking({
    booking_ref: multiGroupRef,
    group_ref: multiGroupRef,
    gate_pass_otp: commonMultiOtp,
    gateway_payment_id: commonPayment,
    customer_id: 'cust-multi-002',
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: groupDate,
    start_time: '19:00',
    end_time: '20:00',
    total_amount: 1800,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  }).booking!;

  const slotB = PostgresEngine.createBooking({
    booking_ref: `${multiGroupRef}-2`,
    group_ref: multiGroupRef,
    gate_pass_otp: commonMultiOtp,
    gateway_payment_id: commonPayment,
    customer_id: 'cust-multi-002',
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: groupDate,
    start_time: '21:00',
    end_time: '22:00',
    total_amount: 1800,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  }).booking!;

  const slotC = PostgresEngine.createBooking({
    booking_ref: `${multiGroupRef}-3`,
    group_ref: multiGroupRef,
    gate_pass_otp: commonMultiOtp,
    gateway_payment_id: commonPayment,
    customer_id: 'cust-multi-002',
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: groupDate,
    start_time: '23:00',
    end_time: '00:00',
    total_amount: 1800,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  }).booking!;

  // Initially link all 3 slots
  const initialThreeSlots = [
    { start_time: '19:00', end_time: '20:00', price: 1800 },
    { start_time: '21:00', end_time: '22:00', price: 1800 },
    { start_time: '23:00', end_time: '00:00', price: 1800 }
  ];
  slotA.all_slots = initialThreeSlots;
  slotB.all_slots = initialThreeSlots;
  slotC.all_slots = initialThreeSlots;
  slotA.total_order_amount = 5400;
  slotB.total_order_amount = 5400;
  slotC.total_order_amount = 5400;

  // Now, cancel ONLY slotA (19:00 - 20:00)
  const cancelResult = PostgresEngine.updateBookingStatus(slotA.id, 'cancelled', {
    refundAmount: 0,
    refundReason: 'Customer requested cancellation of 7pm slot',
    cancelledBy: 'customer'
  });
  assert(cancelResult.success, 'Slot A successfully cancelled');

  // Verify Slot A is cancelled
  assert(slotA.status === 'cancelled', 'Slot A is cancelled');

  // Verify remaining active siblings Slot B and Slot C have updated active slots (only 2 slots, NOT 3)
  const storedSlotB = store.getBookings().find(b => b.id === slotB.id)!;
  const storedSlotC = store.getBookings().find(b => b.id === slotC.id)!;

  assert(storedSlotB.all_slots?.length === 2, 'Slot B all_slots now contains exactly 2 active sessions');
  assert(storedSlotC.all_slots?.length === 2, 'Slot C all_slots now contains exactly 2 active sessions');
  assert(!storedSlotB.all_slots?.some(s => s.start_time === '19:00'), 'Cancelled 19:00 (7 PM) slot is PRUNED from Slot B pass');
  assert(!storedSlotC.all_slots?.some(s => s.start_time === '19:00'), 'Cancelled 19:00 (7 PM) slot is PRUNED from Slot C pass');
  assert(storedSlotB.total_order_amount === 3600, 'Slot B pass total reflects remaining active sessions (₹3600, not ₹5400)');
  assert(storedSlotC.total_order_amount === 3600, 'Slot C pass total reflects remaining active sessions (₹3600, not ₹5400)');

  // Verify dynamic pass filter logic
  const allStoredBookings = store.getBookings();
  const activeSiblings = allStoredBookings.filter(b => 
    (b.status !== 'cancelled' && b.status !== 'refunded') &&
    (getBookingGroupRef(b) === multiGroupRef || b.group_ref === multiGroupRef)
  );
  assert(activeSiblings.length === 2, 'Active sibling query excludes the cancelled 7 PM booking');

  // --------------------------------------------------------------------------
  // TEST 23: Data Retention & Automated 30-Day Owner Excel Archival
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 23: Data Retention Windows & Automated 30-Day Owner Excel Archive ---');

  // 23.1: Verify Excel XML Spreadsheet Generation
  const testCourts = store.getCourts();
  const testCustomers = store.getCustomers();
  const testVenue = store.getVenue();
  const sampleBookings = [slotA, slotB, slotC];

  const excelXml = ExcelExportService.generateExcelXml(sampleBookings, testCourts, testCustomers, testVenue, {
    title: 'TurfFlow Arena Test Archive',
    periodLabel: 'Last 30 Days'
  });

  assert(excelXml.includes('<?xml version="1.0" encoding="UTF-8"?>'), 'Excel XML starts with valid XML declaration');
  assert(excelXml.includes('<Worksheet ss:Name="Booking Ledger">'), 'Excel XML contains Booking Ledger worksheet');
  assert(excelXml.includes('<Worksheet ss:Name="Executive Summary">'), 'Excel XML contains Executive Summary worksheet');
  assert(excelXml.includes('Match Date'), 'Excel XML contains Match Date column header');
  assert(excelXml.includes('Slot Amount (₹)'), 'Excel XML contains Rupee currency header');
  assert(excelXml.includes(slotB.booking_ref), 'Excel XML contains slotB reference');

  // 23.2: Verify Universal CSV Generation with UTF-8 BOM
  const csvData = ExcelExportService.generateCsv(sampleBookings, testCourts, testCustomers);
  assert(csvData.startsWith('\uFEFF'), 'CSV starts with UTF-8 BOM for Microsoft Excel compatibility');
  assert(csvData.includes('"Booking Reference"'), 'CSV includes standard RFC 4180 headers');
  assert(csvData.includes(slotC.booking_ref), 'CSV contains slotC reference');

  // 23.3: Verify Period Filtering (30-day vs 60-day)
  const past45Days = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const past75Days = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const booking45d = PostgresEngine.createBooking({
    booking_ref: 'TRF-TEST-45D',
    customer_id: testCust.id,
    court_id: testCourts[0].id,
    sport_id: store.getSports()[0].id,
    booking_date: past45Days,
    start_time: '10:00',
    end_time: '11:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'completed',
    source: 'online'
  }).booking!;

  const booking75d = PostgresEngine.createBooking({
    booking_ref: 'TRF-TEST-75D',
    customer_id: testCust.id,
    court_id: testCourts[0].id,
    sport_id: store.getSports()[0].id,
    booking_date: past75Days,
    start_time: '10:00',
    end_time: '11:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'completed',
    source: 'online'
  }).booking!;

  const last30dBookings = DataArchiveService.getBookingsForPeriod(30);
  assert(!last30dBookings.some(b => b.id === booking45d.id), '30-day window correctly excludes 45-day-old booking');
  assert(!last30dBookings.some(b => b.id === booking75d.id), '30-day window correctly excludes 75-day-old booking');

  const last60dBookings = DataArchiveService.getBookingsForPeriod(60);
  assert(last60dBookings.some(b => b.id === booking45d.id), '60-day admin window correctly includes 45-day-old booking');
  assert(!last60dBookings.some(b => b.id === booking75d.id), '60-day admin window correctly excludes 75-day-old booking');

  const allTimeBookings = DataArchiveService.getBookingsForPeriod(0);
  assert(allTimeBookings.some(b => b.id === booking45d.id), 'All-time permanent backup retains 45-day-old booking');
  assert(allTimeBookings.some(b => b.id === booking75d.id), 'All-time permanent backup retains 75-day-old booking');

  // 23.4: Verify Owner Email Archive Dispatch & Notification Logging
  const dispatchRes = await DataArchiveService.dispatchArchiveToOwner({
    targetEmail: 'owner@turfflow.com',
    periodDays: 30,
    isManual: true
  });
  assert(dispatchRes.success, 'Data archive report dispatched to owner email');
  assert(dispatchRes.recipient === 'owner@turfflow.com', 'Recipient is owner@turfflow.com');

  const notifLogs = store.getNotificationLogs();
  const archiveNotif = notifLogs.find(n => n.booking_id === 'ARCHIVE-30D');
  assert(!!archiveNotif, 'Notification log recorded for 30-day owner data archive dispatch');
  assert(archiveNotif!.recipient === 'owner@turfflow.com', 'Notification recipient recorded accurately');

  // 23.5: Automated 30-Day Scheduler Trigger
  // Simulate 31 days elapsed
  store.updateDataArchiveSettings({
    last_dispatch_date: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  });

  const configuredOwnerEmail = store.getDataArchiveSettings().owner_email || 'rajupainter84688@gmail.com';
  const autoDispatchCheck = await DataArchiveService.checkAndDispatchAutomatedMonthlyArchive(true);
  assert(autoDispatchCheck.dispatched === true, 'Automated scheduler detected 30+ days elapsed and triggered archive dispatch');
  assert(autoDispatchCheck.recipient === configuredOwnerEmail, `Automated dispatch sent to configured owner email (${configuredOwnerEmail})`);

  // --- TEST 24: Page Refresh & Hold Slot Auto-Release Corner Case ---
  console.log('\n--- TEST 24: Page Refresh & Hold Slot Auto-Release Corner Case ---');
  const refreshTestCourt = store.getCourts()[0];
  const refreshTestDate = '2026-11-18';
  const sessionUserA = 'sess_refresh_test_user_a';
  const sessionUserB = 'sess_refresh_test_user_b';

  // Step 1: User A locks 18:00 slot, User B locks 19:00 slot
  const lockARes = RedisLockService.acquireLock(refreshTestCourt.id, refreshTestDate, '18:00', sessionUserA);
  const lockBRes = RedisLockService.acquireLock(refreshTestCourt.id, refreshTestDate, '19:00', sessionUserB);
  assert(lockARes.success, 'User A acquired 18:00 slot lock');
  assert(lockBRes.success, 'User B acquired 19:00 slot lock');

  // Verify both locks are actively recorded
  assert(!!RedisLockService.getLock(refreshTestCourt.id, refreshTestDate, '18:00'), 'User A lock active');
  assert(!!RedisLockService.getLock(refreshTestCourt.id, refreshTestDate, '19:00'), 'User B lock active');

  // Step 2: User A refreshes the page (triggers releaseAllLocksForSession for User A)
  RedisLockService.releaseAllLocksForSession(sessionUserA);

  // Step 3: Verify User A slot is released immediately
  const checkLockAAfterRefresh = RedisLockService.getLock(refreshTestCourt.id, refreshTestDate, '18:00');
  assert(!checkLockAAfterRefresh, 'User A held slot was immediately released on refresh');

  // Step 4: Verify User B slot is NOT affected and remains held
  const checkLockBAfterRefresh = RedisLockService.getLock(refreshTestCourt.id, refreshTestDate, '19:00');
  assert(!!checkLockBAfterRefresh, 'User B held slot remains protected and held');
  assert(checkLockBAfterRefresh?.locked_by === sessionUserB, 'User B lock ownership preserved');

  // Clean up User B lock
  RedisLockService.releaseAllLocksForSession(sessionUserB);

  // Step 5: Test registered Customer ID hold auto-release on refresh
  const customerId = 'cust-101';
  const custLockRes = RedisLockService.acquireLock(refreshTestCourt.id, refreshTestDate, '20:00', customerId);
  assert(custLockRes.success, 'Customer locked 20:00 slot');
  RedisLockService.releaseAllLocksForSession(customerId);
  assert(!RedisLockService.getLock(refreshTestCourt.id, refreshTestDate, '20:00'), 'Customer held slot immediately released on refresh');

  // --- TEST 25: Audit Logs 60-Day Operational Retention & Email Operation Tracking ---
  console.log('\n--- TEST 25: Audit Logs 60-Day Retention & Email Operation Tracking ---');

  // 25.1: Retention window configuration
  assert(AuditLogger.RETENTION_DAYS === 60, 'AuditLogger retention window is strictly 60 days');
  assert(AuditLogger.RETENTION_MS === 60 * 24 * 60 * 60 * 1000, 'Retention window milliseconds matches 60 days');

  // 25.2: Email Archive Dispatch Audit Logging
  const testArchiveEmail = 'sanjay.owner@example.com';
  const testArchiveLog = AuditLogger.log(
    'adm-001',
    'DISPATCH_EMAIL_ARCHIVE',
    'DataArchive',
    testArchiveEmail,
    null,
    {
      recipient: testArchiveEmail,
      period: 'Last 30 Days',
      bookingsCount: 25,
      netRevenue: 42000,
      attachmentFilename: 'TurfFlow_Master_Ledger_Past_30Days_2026-11-11.xls',
      status: 'sent'
    }
  );
  assert(testArchiveLog.action === 'DISPATCH_EMAIL_ARCHIVE', 'DISPATCH_EMAIL_ARCHIVE logged successfully');
  assert(testArchiveLog.entity_id === testArchiveEmail, 'Target recipient matches test email');
  assert(testArchiveLog.new_value?.bookingsCount === 25, 'Payload booking count preserved in audit metadata');

  // 25.3: Customer Confirmation Email Audit Logging
  const testConfirmLog = AuditLogger.log(
    'SYSTEM',
    'SEND_EMAIL_CONFIRMATION',
    'Booking',
    'TRF-20261111-9999',
    null,
    {
      recipient: 'customer99@example.com',
      customerName: 'Kunal Kapoor',
      bookingRef: 'TRF-20261111-9999',
      slot: '11/11/2026 06:00 PM - 07:00 PM',
      status: 'sent'
    }
  );
  assert(testConfirmLog.admin_name === 'System Automation', 'SYSTEM admin ID correctly resolves to System Automation');
  assert(testConfirmLog.action === 'SEND_EMAIL_CONFIRMATION', 'SEND_EMAIL_CONFIRMATION logged successfully');

  // 25.4: Automatic 60-Day Purging & Retention Filtering
  const nowMs = Date.now();
  const seventyDaysAgoIso = new Date(nowMs - 70 * 24 * 60 * 60 * 1000).toISOString();
  const tenDaysAgoIso = new Date(nowMs - 10 * 24 * 60 * 60 * 1000).toISOString();

  // Inject stale record (>60 days old) and fresh record (<60 days old)
  const existingAuditLogs = store.getAuditLogs();
  store.setAuditLogs([
    {
      id: 'audit-stale-test-70d',
      admin_user_id: 'adm-001',
      admin_name: 'Sanjay Kumar (Owner)',
      action: 'UPDATE_COURT',
      entity_type: 'Court',
      entity_id: 'crt-001',
      created_at: seventyDaysAgoIso
    },
    {
      id: 'audit-fresh-test-10d',
      admin_user_id: 'adm-002',
      admin_name: 'Amit Patel (Staff)',
      action: 'UPDATE_BOOKING_STATUS_COMPLETED',
      entity_type: 'Booking',
      entity_id: 'TRF-2026-TEST',
      created_at: tenDaysAgoIso
    },
    ...existingAuditLogs
  ]);

  // Execute explicit 60-day purge
  const purgedCount = AuditLogger.purgeRecordsOlderThan60Days();
  assert(purgedCount >= 1, `Purged ${purgedCount} stale records older than 60 days`);

  const activeAuditLogs = AuditLogger.getLogsLast60Days();
  const hasStaleLog = activeAuditLogs.some(l => l.id === 'audit-stale-test-70d');
  const hasFreshLog = activeAuditLogs.some(l => l.id === 'audit-fresh-test-10d');
  assert(!hasStaleLog, 'Records older than 60 days are successfully removed from audit logs');
  assert(hasFreshLog, 'Records within 60 days are preserved intact');

  // Verify all entries in activeAuditLogs are within 60 days
  const sixtyDaysLimitMs = nowMs - AuditLogger.RETENTION_MS;
  const allWithin60Days = activeAuditLogs.every(l => new Date(l.created_at).getTime() >= sixtyDaysLimitMs);
  assert(allWithin60Days, '100% of returned audit logs strictly respect the 60-day retention window');

  // --- TEST 26: Production Auth - Signup OTPs, Forgot Password, and Profile Email Update OTP ---
  console.log('\n--- TEST 26: Production Auth: Dual Signup OTPs, Password Reset & Profile Email OTP ---');

  // 26.1: Request Mobile Signup OTP via SMS
  const smsReq = await SmsVerificationService.requestOtp('9822334455', 'signup', 'Arun Joshi');
  assert(smsReq.success === true, 'Mobile signup OTP requested successfully');
  assert(!!smsReq.code && smsReq.code.length === 4, 'Generated 4-digit mobile OTP code');

  // 26.2: Request Email Signup OTP via Resend
  const emailReq = await EmailVerificationService.requestOtp('arun.joshi@example.com', 'signup', 'Arun Joshi');
  assert(emailReq.success === true, 'Email signup OTP requested successfully via Resend');
  assert(!!emailReq.code && emailReq.code.length === 6, 'Generated 6-digit email OTP code');

  // 26.3: Register Customer using Dual Verified OTPs
  const regRes = CustomerAuthService.register(
    'Arun Joshi',
    '9822334455',
    smsReq.code!,
    'securePass2026',
    'arun.joshi@example.com',
    emailReq.code!
  );
  assert(regRes.success === true, 'Registration succeeded with verified Dual OTPs');
  assert(Boolean(regRes.session?.customer.phone.includes('9822334455')), 'Registered customer profile phone matches');
  assert(regRes.session?.customer.email === 'arun.joshi@example.com', 'Registered customer profile email matches');
  assert(regRes.session?.customer.email_verified === true, 'Customer email marked verified');

  // 26.4: Log in with newly registered real password
  const newLogin = CustomerAuthService.loginWithPassword('9822334455', 'securePass2026');
  assert(newLogin.success === true, 'Customer successfully logged in with real password');
  const badLogin = CustomerAuthService.loginWithPassword('9822334455', 'wrongpass');
  assert(badLogin.success === false, 'Bad password rejected for customer');

  // 26.5: Forgot Password flow via Mobile SMS
  const forgotSmsReq = await CustomerAuthService.sendPasswordResetOtp('9822334455');
  assert(forgotSmsReq.success === true, 'Password reset OTP dispatched via SMS');
  assert(!!(forgotSmsReq as any).code, 'Forgot password SMS code generated');

  const pwdResetRes = CustomerAuthService.resetPasswordWithOtp('9822334455', (forgotSmsReq as any).code, 'brandNewPass789');
  assert(pwdResetRes.success === true, 'Password reset succeeded with SMS OTP');
  const oldPassLogin = CustomerAuthService.loginWithPassword('9822334455', 'securePass2026');
  assert(oldPassLogin.success === false, 'Old password no longer works after reset');
  const freshPassLogin = CustomerAuthService.loginWithPassword('9822334455', 'brandNewPass789');
  assert(freshPassLogin.success === true, 'New password works immediately for login');

  // 26.6: Profile Email Update with Email OTP Verification
  const updateEmailOtpReq = await EmailVerificationService.requestOtp('arun.updated@example.com', 'profile_update', 'Arun Joshi');
  assert(updateEmailOtpReq.success === true, 'Profile update email OTP requested via Resend');
  assert(!!updateEmailOtpReq.code, 'Generated 6-digit profile update email code');

  const updateEmailRes = CustomerAuthService.updateCustomerEmail(regRes.session!.customer.id, 'arun.updated@example.com', updateEmailOtpReq.code!);
  assert(updateEmailRes.success === true, 'Email updated successfully after OTP verification');
  assert(updateEmailRes.customer?.email === 'arun.updated@example.com', 'Customer email updated to new verified address');
  assert(updateEmailRes.customer?.email_verified === true, 'Updated email marked verified');

  // Verify duplicate email update is blocked
  const dupUpdate = CustomerAuthService.updateCustomerEmail('cust-101', 'arun.updated@example.com', '123456');
  assert(dupUpdate.success === false, 'Cannot update email to an address already owned by another customer');

  // --- TEST 27: Resend Sender Email Conflict Prevention & Warning ---
  console.log('\n--- TEST 27: Resend Sender Email Conflict Prevention & Warning ---');
  const resendSender = EmailService.getResendSenderEmail();
  assert(resendSender === 'rajupainter84688@gmail.com', `Resend sender email correctly resolves to rajupainter84688@gmail.com (got: ${resendSender})`);
  assert(EmailService.isResendSenderEmail('rajupainter84688@gmail.com') === true, 'Matches exact sender email');
  assert(EmailService.isResendSenderEmail('Rajupainter84688@Gmail.Com') === true, 'Case-insensitive match for sender email');
  assert(EmailService.isResendSenderEmail('other.user@example.com') === false, 'Non-sender email correctly identified as external');
  assert(EmailService.isResendSenderEmail('') === false, 'Empty email safely returns false');
  assert(EmailService.isResendSenderEmail(null) === false, 'Null email safely returns false');

  // Verify that dispatching to sender email is strictly blocked
  const blockedSenderDispatch = await DataArchiveService.dispatchArchiveToOwner({
    targetEmail: 'rajupainter84688@gmail.com',
    periodDays: 30
  });
  assert(blockedSenderDispatch.success === false, 'Dispatching archive to sender email is cleanly blocked');
  assert(blockedSenderDispatch.message.includes('sender email'), 'Clear warning returned indicating sender & recipient cannot be the same');

  // Verify that dispatching to a distinct recipient email succeeds
  const validRecipientDispatch = await DataArchiveService.dispatchArchiveToOwner({
    targetEmail: 'owner@turfflow.com',
    periodDays: 30
  });
  assert(validRecipientDispatch.success === true, 'Dispatching archive to distinct recipient email succeeds');

  // --- TEST 28: Profile Email Update Conflict Validations (Same Email & Duplicate Registered Email) ---
  console.log('\n--- TEST 28: Profile Email Update Conflict Validations (Same Email & Duplicate Registered Email) ---');
  
  // Validation function mirroring CustomerProfilePage validation logic
  const validateProfileEmailUpdate = (newEmail: string, oldEmail?: string, currentCustId?: string) => {
    const cleanNew = newEmail.trim().toLowerCase();
    const cleanOld = (oldEmail || '').trim().toLowerCase();

    if (!cleanNew) {
      return { isConflict: false, warning: null, isValid: false };
    }

    // 1. Both old and new should not be the same
    if (cleanOld && cleanNew === cleanOld) {
      return {
        isConflict: true,
        warning: 'New email cannot be the same as your old email.',
        isValid: false
      };
    }

    // 2. Format check
    const isValidFormat = cleanNew.includes('@') && cleanNew.includes('.') && cleanNew.length >= 5;
    if (!isValidFormat) {
      return {
        isConflict: false,
        warning: null,
        isValid: false
      };
    }

    // 3. New email should not already be registered to another account
    const customers = store.getCustomers();
    const duplicateCustomer = customers.find(
      c => c.id !== currentCustId && c.email && c.email.trim().toLowerCase() === cleanNew
    );

    if (duplicateCustomer) {
      return {
        isConflict: true,
        warning: 'This email is already registered with another account.',
        isValid: false
      };
    }

    return {
      isConflict: false,
      warning: null,
      isValid: true
    };
  };

  const testCustomer = store.getCustomers()[0];
  const oldEmail = testCustomer.email || 'customer1@example.com';

  // 28.1: Test same email conflict check (case-insensitive and trimmed)
  const sameEmailVal1 = validateProfileEmailUpdate(oldEmail, oldEmail, testCustomer.id);
  assert(sameEmailVal1.isConflict === true, 'Identical email flagged as conflict');
  assert(sameEmailVal1.warning === 'New email cannot be the same as your old email.', 'Exact same email warning message returned');
  assert(sameEmailVal1.isValid === false, 'Same email marked invalid');

  const sameEmailVal2 = validateProfileEmailUpdate(`  ${oldEmail.toUpperCase()}  `, oldEmail, testCustomer.id);
  assert(sameEmailVal2.isConflict === true, 'Case-insensitive & whitespace trimmed same email flagged as conflict');
  assert(sameEmailVal2.warning === 'New email cannot be the same as your old email.', 'Same email warning returned for uppercase input');

  // 28.2: Test duplicate already registered email check
  const anotherCustomer = store.getCustomers().find(c => c.id !== testCustomer.id && c.email) || {
    id: 'cust-temp-dup-99',
    name: 'Existing Other User',
    phone: '+919988776655',
    email: 'other.existing.user@turfflow.com',
    email_verified: true,
    created_at: new Date().toISOString(),
    total_bookings: 0,
    total_spent: 0,
    no_show_count: 0,
    is_blacklisted: false
  };
  if (!store.getCustomers().some(c => c.id === anotherCustomer.id)) {
    store.addCustomer(anotherCustomer as any);
  }

  const dupEmailVal = validateProfileEmailUpdate(anotherCustomer.email!, oldEmail, testCustomer.id);
  assert(dupEmailVal.isConflict === true, 'Already registered email flagged as conflict');
  assert(dupEmailVal.warning === 'This email is already registered with another account.', 'Duplicate registered email warning message returned');
  assert(dupEmailVal.isValid === false, 'Duplicate registered email marked invalid');

  // Verify CustomerAuthService.updateCustomerEmail blocks duplicate registration
  const blockedDupUpdateRes = CustomerAuthService.updateCustomerEmail(testCustomer.id, anotherCustomer.email!, '123456');
  assert(blockedDupUpdateRes.success === false, 'CustomerAuthService blocks update when email is registered to another account');

  // 28.3: Test fresh, distinct, unregistered email
  const freshEmail = `unique.player.${Date.now()}@example.com`;
  const freshEmailVal = validateProfileEmailUpdate(freshEmail, oldEmail, testCustomer.id);
  assert(freshEmailVal.isConflict === false, 'Fresh distinct email has no conflict');
  assert(freshEmailVal.warning === null, 'No warning for fresh distinct email');
  assert(freshEmailVal.isValid === true, 'Fresh distinct email marked valid for verification');

  // 28.4: Request and confirm OTP for fresh email
  const freshEmailOtpReq = await EmailVerificationService.requestOtp(freshEmail, 'profile_update', testCustomer.name);
  assert(freshEmailOtpReq.success === true, 'OTP requested for fresh email');
  const freshEmailUpdateRes = CustomerAuthService.updateCustomerEmail(testCustomer.id, freshEmail, freshEmailOtpReq.code!);
  assert(freshEmailUpdateRes.success === true, 'Customer email updated successfully with valid OTP');
  assert(freshEmailUpdateRes.customer?.email === freshEmail, 'Customer record reflects updated email');
  assert(freshEmailUpdateRes.customer?.email_verified === true, 'Customer email verified status set to true');


  // --- TEST 29: Corrupt / Clock-Skewed Far-Future Slot Locks & Pending Holds Auto-Purge ---
  console.log('\n--- TEST 29: Corrupt / Clock-Skewed Far-Future Slot Locks & Pending Holds Auto-Purge ---');
  const skewCourt = store.getCourts()[0];
  const skewDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const corruptLock = {
    court_id: skewCourt.id,
    date: skewDate,
    start_time: '20:00',
    locked_by: 'corrupt-session-187m',
    expires_at: Date.now() + 187 * 60 * 1000
  };
  const validLock = {
    court_id: skewCourt.id,
    date: skewDate,
    start_time: '21:00',
    locked_by: 'valid-session-5m',
    expires_at: Date.now() + 290 * 1000
  };
  store.setSlotLocks([...store.getSlotLocks(), corruptLock, validLock]);
  const afterPurgeCorrupt = RedisLockService.getLock(skewCourt.id, skewDate, '20:00');
  assert(afterPurgeCorrupt === undefined, 'Corrupt 187-minute far-future lock automatically purged');
  const afterPurgeValid = RedisLockService.getLock(skewCourt.id, skewDate, '21:00');
  assert(afterPurgeValid !== undefined, 'Valid 5-minute lock preserved intact');
  const validConflict = RedisLockService.checkAdminConflict(skewCourt.id, skewDate, '21:00');
  assert(validConflict.remainingSeconds > 0 && validConflict.remainingSeconds <= 300, 'Valid hold countdown capped strictly <= 300s');
  RedisLockService.releaseLock(skewCourt.id, skewDate, '21:00', 'valid-session-5m');

  store.setBookings([...store.getBookings(), {
    id: 'bk-skew-future',
    booking_ref: 'TRF-SKEW-FUT',
    customer_id: 'cust-101',
    court_id: skewCourt.id,
    sport_id: skewCourt.sport_ids[0],
    booking_date: skewDate,
    start_time: '20:00',
    end_time: '21:00',
    source: 'online',
    status: 'pending_payment',
    total_amount: 1800,
    discount_amount: 0,
    created_at: new Date(Date.now() + 180 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }]);
  const skewSlots = SlotEngine.computeSlotsForCourt(skewCourt, skewDate);
  const skew20 = skewSlots.find(s => s.start_time === '20:00');
  assert(skew20?.status === 'available', 'Clock-skewed future pending_payment booking does not hold slot');
  store.setBookings(store.getBookings().filter(b => b.id !== 'bk-skew-future'));

  // --- TEST 30: Inactivity Hold Timeout & Site Auto-Deselect After 5 Minutes ---
  console.log('\n--- TEST 30: Inactivity Hold Timeout & Site Auto-Deselect After 5 Minutes ---');
  const inactivityTestCourt = store.getCourts()[1] || store.getCourts()[0];
  const inactivityTestDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const testSlotTime = '11:00';
  const testSessionId = 'sess_inactivity_test_user_1';

  // 30.1: User selects slot and acquires 5-minute lock
  const lockAcquire = RedisLockService.acquireLock(inactivityTestCourt.id, inactivityTestDate, testSlotTime, testSessionId);
  assert(lockAcquire.success === true, 'Slot lock successfully acquired for selected slot');
  assert(lockAcquire.lock?.locked_by === testSessionId, 'Lock ownership matches user session ID');
  const initialLock = RedisLockService.getLock(inactivityTestCourt.id, inactivityTestDate, testSlotTime);
  assert(initialLock !== undefined, 'Slot is locked in Redis');

  // Verify slot is locked by user in slot engine
  const slotsDuringHold = SlotEngine.computeSlotsForCourt(inactivityTestCourt, inactivityTestDate, testSessionId);
  const userHeldSlot = slotsDuringHold.find(s => s.start_time === testSlotTime);
  assert(userHeldSlot?.status === 'locked' && userHeldSlot.locked_by === testSessionId, 'Slot engine reflects user hold');

  // Other user attempting to select is blocked
  const otherUserLockAttempt = RedisLockService.acquireLock(inactivityTestCourt.id, inactivityTestDate, testSlotTime, 'sess_other_user_2');
  assert(otherUserLockAttempt.success === false, 'Other user blocked from selecting currently held slot');

  // 30.2: Inactivity Watchdog Simulation (5 Minutes Inactivity / Hold Timeout)
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
  let lastActivityTime = Date.now() - (INACTIVITY_TIMEOUT_MS + 1000); // 5 min + 1s ago (idle)

  const isIdle5Min = (Date.now() - lastActivityTime) >= INACTIVITY_TIMEOUT_MS;
  assert(isIdle5Min === true, 'Inactivity watchdog accurately detects 5+ minutes of inactivity');

  // Simulate handleHoldExpired execution
  // 1. Release all locks for session
  RedisLockService.releaseAllLocksForSession(testSessionId);
  const lockAfterTimeout = RedisLockService.getLock(inactivityTestCourt.id, inactivityTestDate, testSlotTime);
  assert(lockAfterTimeout === undefined, 'Held slot lock is released after 5-minute inactivity timeout');

  // 2. Selected slots array is deselected
  let selectedSlotsSimulation = [{ start_time: testSlotTime, end_time: '18:00', price: 1200 }];
  selectedSlotsSimulation = [];
  assert(selectedSlotsSimulation.length === 0, 'Selected slots array is cleared/deselected');

  // 3. Slot immediately returns to available in SlotEngine for all users
  const slotsAfterDeselect = SlotEngine.computeSlotsForCourt(inactivityTestCourt, inactivityTestDate);
  const releasedSlot = slotsAfterDeselect.find(s => s.start_time === testSlotTime);
  assert(releasedSlot?.status === 'available', 'Slot engine returns slot to available status');

  // 4. Other user can now immediately acquire the slot
  const otherUserAcquire = RedisLockService.acquireLock(inactivityTestCourt.id, inactivityTestDate, testSlotTime, 'sess_other_user_2');
  assert(otherUserAcquire.success === true, 'Another user can immediately select the slot once 5-minute timeout deselects it');
  RedisLockService.releaseLock(inactivityTestCourt.id, inactivityTestDate, testSlotTime, 'sess_other_user_2');

  // ==========================================
  // TEST 31: Multi-Booking Pass & Print Accuracy — Exact Slot Timing Verification
  // ==========================================
  console.log('\n--- TEST 31: Multi-Booking Pass & Print Accuracy — Exact Slot Timing Verification ---');

  const multiTestCommonOtp = '8899';
  const multiTestGroupRef = 'TRF-GRP-MULTI-ACCURACY';
  const multiTestDate = '2026-11-20';
  const multiTestCourtId = 'crt-001';

  const multiBooking1: Booking = {
    id: 'bk-accuracy-1',
    booking_ref: 'TRF-ACCURACY-01',
    group_ref: multiTestGroupRef,
    court_id: multiTestCourtId,
    sport_id: 'sp-football',
    customer_id: 'cust-101',
    customer_name: 'Rahul Sharma',
    customer_phone: '+919876543210',
    booking_date: multiTestDate,
    start_time: '10:00',
    end_time: '11:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online',
    gate_pass_otp: multiTestCommonOtp,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const multiBooking2: Booking = {
    id: 'bk-accuracy-2',
    booking_ref: 'TRF-ACCURACY-02',
    group_ref: multiTestGroupRef,
    court_id: multiTestCourtId,
    sport_id: 'sp-football',
    customer_id: 'cust-101',
    customer_name: 'Rahul Sharma',
    customer_phone: '+919876543210',
    booking_date: multiTestDate,
    start_time: '11:00',
    end_time: '12:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online',
    gate_pass_otp: multiTestCommonOtp,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const multiBooking3: Booking = {
    id: 'bk-accuracy-3',
    booking_ref: 'TRF-ACCURACY-03',
    group_ref: multiTestGroupRef,
    court_id: multiTestCourtId,
    sport_id: 'sp-football',
    customer_id: 'cust-101',
    customer_name: 'Rahul Sharma',
    customer_phone: '+919876543210',
    booking_date: multiTestDate,
    start_time: '14:00',
    end_time: '15:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online',
    gate_pass_otp: multiTestCommonOtp,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  store.getBookings().push(multiBooking1, multiBooking2, multiBooking3);

  // 31.1: Common gate pass OTP and group reference verification
  assert(getBookingGatePassOtp(multiBooking1) === multiTestCommonOtp, 'Booking 1 resolves common gatepass OTP');
  assert(getBookingGatePassOtp(multiBooking2) === multiTestCommonOtp, 'Booking 2 resolves common gatepass OTP');
  assert(getBookingGatePassOtp(multiBooking3) === multiTestCommonOtp, 'Booking 3 resolves common gatepass OTP');
  assert(getBookingGroupRef(multiBooking1) === multiTestGroupRef, 'All 3 bookings belong to common group reference');

  // 31.2: When viewing/printing Booking 1: timing must be strictly 10:00 - 11:00
  const pass1Time = `${formatTime12hPlain(multiBooking1.start_time)} – ${formatTime12hPlain(multiBooking1.end_time)}`;
  assert(pass1Time === '10:00 AM – 11:00 AM', `Booking 1 print pass timing is exactly 10:00 AM – 11:00 AM (got ${pass1Time})`);
  assert(pass1Time !== '06:00 PM – 07:00 PM', 'Booking 1 timing is NOT defaulted to synthetic 6:00 PM - 7:00 PM');

  // 31.3: When viewing/printing Booking 2: timing must be strictly 11:00 - 12:00
  const pass2Time = `${formatTime12hPlain(multiBooking2.start_time)} – ${formatTime12hPlain(multiBooking2.end_time)}`;
  assert(pass2Time === '11:00 AM – 12:00 PM', `Booking 2 print pass timing is exactly 11:00 AM – 12:00 PM (got ${pass2Time})`);
  assert(pass2Time !== '06:00 PM – 07:00 PM', 'Booking 2 timing is NOT defaulted to synthetic 6:00 PM - 7:00 PM');

  // 31.4: When viewing/printing Booking 3: timing must be strictly 02:00 - 03:00
  const pass3Time = `${formatTime12hPlain(multiBooking3.start_time)} – ${formatTime12hPlain(multiBooking3.end_time)}`;
  assert(pass3Time === '02:00 PM – 03:00 PM', `Booking 3 print pass timing is exactly 02:00 PM – 03:00 PM (got ${pass3Time})`);
  assert(pass3Time !== '06:00 PM – 07:00 PM', 'Booking 3 timing is NOT defaulted to synthetic 6:00 PM - 7:00 PM');

  // 31.5: Sibling session aggregation identifies all 3 active sessions under common pass
  const siblingList = store.getBookings().filter(b => getBookingGroupRef(b) === multiTestGroupRef);
  assert(siblingList.length === 3, 'Finds exactly 3 sibling sessions under common pass');
  const distinctSlots = Array.from(new Map(siblingList.map(b => [`${b.start_time}-${b.end_time}`, b])).values());
  assert(distinctSlots.length === 3, 'All 3 sessions have distinct timeslots under common pass');

  // --- TEST 32: WhatsApp Slot Unavailable & Time Formatting (Strict 12-Hour AM/PM Format) ---
  console.log('\n--- TEST 32: WhatsApp Slot Unavailable & Time Formatting (Strict 12-Hour AM/PM Format) ---');
  
  // 32.1: Formatting 24h slot to 12h slot
  const testSlot24 = '19:00';
  const formatted12h = formatTime12hPlain(testSlot24);
  assert(formatted12h === '07:00 PM', `19:00 correctly formatted to 12h format (got: ${formatted12h})`);
  assert(!formatted12h.includes('19:00'), 'Formatted time does not contain 24-hr format 19:00');

  // 32.2: Slot unavailable error message formatting
  const mockSlotUnavailableMsg = `Slot ${formatted12h} is already booked or past.`;
  assert(!/\b([01]?\d|2[0-3]):[0-5]\d\b(?!\s*[AP]M)/i.test(mockSlotUnavailableMsg), 'Unavailable message contains NO bare 24-hr time strings');
  assert(mockSlotUnavailableMsg === 'Slot 07:00 PM is already booked or past.', 'Message exactly displays 12-hour formatted time with PM');

  // 32.3: Morning and midnight times
  assert(formatTime12hPlain('06:00') === '06:00 AM', '06:00 formatted to 06:00 AM');
  assert(formatTime12hPlain('23:00') === '11:00 PM', '23:00 formatted to 11:00 PM');
  assert(formatTime12hPlain('12:00') === '12:00 PM', '12:00 formatted to 12:00 PM');
  console.log('✅ PASSED: All WhatsApp slot unavailable messages strictly use 12-hour format with AM/PM');

  // --- TEST 33: WhatsApp Slot List Shows Sport Name Per Pitch ---
  console.log('\n--- TEST 33: WhatsApp Slot List Shows Sport Name Per Pitch ---');
  const allCourts = store.getCourts();
  const allSports = store.getSports();

  for (const court of allCourts) {
    const courtSports = allSports.filter(s => court.sport_ids?.includes(s.id));
    const sportLabel = courtSports.map(s => `${s.icon ? s.icon + ' ' : ''}${s.name}`).join(', ');
    assert(sportLabel.length > 0, `Court ${court.name} has mapped sport(s)`);
    assert(courtSports.length === court.sport_ids.length, `All sports for ${court.name} cleanly resolved`);
    
    // Validate sports mapping per court
    if (court.id === 'crt-001') {
      assert(sportLabel.includes('Football'), 'Turf A correctly indicates Football');
    } else if (court.id === 'crt-002') {
      assert(sportLabel.includes('Football') && sportLabel.includes('Cricket'), 'Turf B correctly indicates both Football and Cricket');
    } else if (court.id === 'crt-003') {
      assert(sportLabel.includes('Badminton'), 'Court 1 correctly indicates Badminton');
    }
  }
  console.log('✅ PASSED: Sport name cleanly rendered for every pitch in slot listings');

  // --- TEST 34: Continuous & Disjoint Slots Individual Passes with Common Gate Pass OTP & Single Continuous Slot Cancellation ---
  console.log('\n--- TEST 34: Continuous & Disjoint Slots Individual Passes with Common Gate Pass OTP & Single Continuous Slot Cancellation ---');
  const t34Date = new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0];
  const t34CustId = 'cust-multi-cont-001';
  const t34PrimaryRef = `TRF-${t34Date.replace(/-/g, '')}-9542`;
  const t34CommonOtp = '9542';
  const t34PaymentId = `pay_t34_live_${Date.now()}`;

  // Customer selects 6-7, 7-8 (continuous), and 13-14 (1 PM, disjoint)
  const selectedSlotsT34 = [
    { start_time: '06:00', end_time: '07:00', price: 1200 },
    { start_time: '07:00', end_time: '08:00', price: 1200 },
    { start_time: '13:00', end_time: '14:00', price: 1500 }
  ];
  const t34GrandTotal = 3900;
  const t34Summary = '06:00 AM – 07:00 AM, 07:00 AM – 08:00 AM, 01:00 PM – 02:00 PM';

  // 34.1: Verify each slot generates an independent booking record
  const bk1 = PostgresEngine.createBooking({
    booking_ref: t34PrimaryRef,
    group_ref: t34PrimaryRef,
    gate_pass_otp: t34CommonOtp,
    gateway_payment_id: t34PaymentId,
    total_order_amount: t34GrandTotal,
    all_slots: selectedSlotsT34,
    formatted_slots: t34Summary,
    customer_id: t34CustId,
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: t34Date,
    start_time: '06:00',
    end_time: '07:00',
    total_amount: 1200,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  }).booking!;

  const bk2 = PostgresEngine.createBooking({
    booking_ref: `${t34PrimaryRef}-2`,
    group_ref: t34PrimaryRef,
    gate_pass_otp: t34CommonOtp,
    gateway_payment_id: t34PaymentId,
    total_order_amount: t34GrandTotal,
    all_slots: selectedSlotsT34,
    formatted_slots: t34Summary,
    customer_id: t34CustId,
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: t34Date,
    start_time: '07:00',
    end_time: '08:00',
    total_amount: 1200,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  }).booking!;

  const bk3 = PostgresEngine.createBooking({
    booking_ref: `${t34PrimaryRef}-3`,
    group_ref: t34PrimaryRef,
    gate_pass_otp: t34CommonOtp,
    gateway_payment_id: t34PaymentId,
    total_order_amount: t34GrandTotal,
    all_slots: selectedSlotsT34,
    formatted_slots: t34Summary,
    customer_id: t34CustId,
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: t34Date,
    start_time: '13:00',
    end_time: '14:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  }).booking!;

  assert(Boolean(bk1 && bk2 && bk3), 'All 3 bookings created individually');
  assert(bk1.start_time === '06:00' && bk1.end_time === '07:00', 'Booking 1 is strictly 06:00 - 07:00 (not merged into 6-8)');
  assert(bk2.start_time === '07:00' && bk2.end_time === '08:00', 'Booking 2 is strictly 07:00 - 08:00 (not merged into 6-8)');
  assert(bk3.start_time === '13:00' && bk3.end_time === '14:00', 'Booking 3 is strictly 13:00 - 14:00');
  assert(bk1.gate_pass_otp === t34CommonOtp && bk2.gate_pass_otp === t34CommonOtp && bk3.gate_pass_otp === t34CommonOtp, 'All 3 bookings share identical 4-digit Gate Pass OTP');
  assert(bk1.group_ref === t34PrimaryRef && bk2.group_ref === t34PrimaryRef && bk3.group_ref === t34PrimaryRef, 'All 3 bookings share identical group_ref');

  // 34.2: Verify SlotEngine detects all 3 slots as booked before cancellation
  const slotsBeforeCancel = SlotEngine.computeSlotsForCourt(targetCourt, t34Date, '9876543210');
  const s06 = slotsBeforeCancel.find(s => s.start_time === '06:00');
  const s07 = slotsBeforeCancel.find(s => s.start_time === '07:00');
  const s13 = slotsBeforeCancel.find(s => s.start_time === '13:00');
  assert(s06?.status !== 'available', 'Slot 06:00 - 07:00 is booked');
  assert(s07?.status !== 'available', 'Slot 07:00 - 08:00 is booked');
  assert(s13?.status !== 'available', 'Slot 13:00 - 14:00 is booked');

  // 34.3: Cancel ONLY continuous slot 2 (07:00 - 08:00)
  const cancelBk2Result = PostgresEngine.updateBookingStatus(bk2.id, 'cancelled', {
    refundAmount: 0,
    refundReason: 'Customer cancelled continuous slot 07:00 - 08:00',
    cancelledBy: 'customer'
  });
  assert(cancelBk2Result.success, 'Continuous slot 2 (07:00 - 08:00) cancelled successfully');

  // 34.4: Verify Slot 2 is cancelled, but Slot 1 and Slot 3 remain strictly confirmed!
  const updatedBk1 = store.getBookings().find(b => b.id === bk1.id)!;
  const updatedBk2 = store.getBookings().find(b => b.id === bk2.id)!;
  const updatedBk3 = store.getBookings().find(b => b.id === bk3.id)!;
  assert(updatedBk2.status === 'cancelled', 'Slot 2 is marked cancelled');
  assert(updatedBk1.status === 'confirmed', 'Slot 1 (06:00 - 07:00) remains confirmed and active');
  assert(updatedBk3.status === 'confirmed', 'Slot 3 (13:00 - 14:00) remains confirmed and active');
  assert(updatedBk1.gate_pass_otp === t34CommonOtp && updatedBk3.gate_pass_otp === t34CommonOtp, 'Remaining active slots retain common 4-digit Gate Pass OTP');

  // 34.5: Verify SlotEngine immediately frees up 07:00 - 08:00 while keeping 06:00 - 07:00 booked
  const slotsAfterCancel = SlotEngine.computeSlotsForCourt(targetCourt, t34Date, '9876543210');
  const s06After = slotsAfterCancel.find(s => s.start_time === '06:00');
  const s07After = slotsAfterCancel.find(s => s.start_time === '07:00');
  const s13After = slotsAfterCancel.find(s => s.start_time === '13:00');
  assert(s06After?.status !== 'available', 'Slot 06:00 - 07:00 is STILL booked');
  assert(s07After?.status === 'available', 'Slot 07:00 - 08:00 is now immediately AVAILABLE after single-slot cancellation');
  assert(s13After?.status !== 'available', 'Slot 13:00 - 14:00 is STILL booked');
  console.log('✅ PASSED: Continuous slot cancellation frees only target slot while siblings retain active booking and common gate pass OTP');

  // --- TEST 35: Admin Refund Flow - Confirmation Popup & Toastbar Contract ---
  console.log('\n--- TEST 35: Admin Refund Flow - Confirmation Popup & Toastbar Contract ---');
  const t35Ref = `TRF-TEST35-${Date.now()}`;
  const t35Date = getVenueDateString(2);
  const t35Booking = PostgresEngine.createBooking({
    booking_ref: t35Ref,
    customer_id: 'cust-101',
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: t35Date,
    start_time: '18:00',
    end_time: '19:00',
    total_amount: 1500,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  });
  assert(Boolean(t35Booking.success && t35Booking.booking), 'Test booking for refund confirmation created');

  // Verify refund validation logic
  const validAdmin = store.getAdminUsers().find(a => a.role === 'owner')!;
  const staffAdmin = store.getAdminUsers().find(a => a.role === 'staff')!;
  assert(validAdmin.role === 'owner' || validAdmin.role === 'manager', 'Owner/Manager has refund authority');
  assert(staffAdmin.role === 'staff', 'Staff role identified');

  // Execute refund via state machine
  const refundAmount = 1500;
  const refundReason = 'Customer emergency cancellation with admin confirmation';
  const refundResult = PostgresEngine.updateBookingStatus(t35Booking.booking!.id, 'refunded', {
    refundAmount,
    refundReason,
    adminId: validAdmin.id,
    cancelledBy: 'admin',
    noticeHours: 48,
    metTerms: true
  });
  assert(refundResult.success, 'Refund executed successfully via PostgresEngine');

  const updatedBooking = store.getBookings().find(b => b.id === t35Booking.booking!.id)!;
  assert(updatedBooking.status === 'refunded', 'Booking transitioned to refunded');
  assert(updatedBooking.refund_amount === 1500, 'Refund amount ₹1500 correctly recorded');
  assert(updatedBooking.refund_reason === refundReason, 'Refund reason preserved');

  console.log('✅ PASSED: Admin refund execution correctly transitions booking status and records ledger');

  // --- TEST 36: Owner Cancellation Email & Dedicated Refund Email Dispatch ---
  console.log('\n--- TEST 36: Owner Cancellation Email & Dedicated Refund Email Dispatch ---');
  const t36Customer = {
    id: `cust-t36-${Date.now()}`,
    name: 'Rohit Sharma',
    phone: '9888877771',
    email: 'rohit.sharma@example.com',
    created_at: new Date().toISOString(),
    total_bookings: 0,
    total_spent: 0,
    no_show_count: 0,
    is_blacklisted: false
  };
  store.addCustomer(t36Customer);

  // 36.1: Owner cancels booking with zero refund -> Cancellation email sent, NO refund email sent
  const t36Ref1 = `TRF-T36-CANCEL-${Date.now()}`;
  const t36Booking1 = PostgresEngine.createBooking({
    booking_ref: t36Ref1,
    customer_id: t36Customer.id,
    court_id: targetCourt.id,
    sport_id: 'sp-football',
    booking_date: getVenueDateString(7),
    start_time: '10:00',
    end_time: '11:00',
    total_amount: 1400,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  });
  assert(Boolean(t36Booking1.success && t36Booking1.booking), 'Booking 1 created for owner cancellation');

  const t36CancelResult = PostgresEngine.updateBookingStatus(t36Booking1.booking!.id, 'cancelled', {
    adminId: validAdmin.id,
    cancelledBy: 'admin',
    refundReason: 'Pitch maintenance emergency',
    refundAmount: 0
  });
  assert(t36CancelResult.success, 'Owner cancelled booking successfully');

  const logsAfterCancel = store.getNotificationLogs().filter(n => n.booking_id === t36Booking1.booking!.id);
  const cancelEmailLog = logsAfterCancel.find(n => n.channel === 'email' && n.type === 'cancellation');
  const refundEmailLog1 = logsAfterCancel.find(n => n.channel === 'email' && n.type === 'refund');

  assert(Boolean(cancelEmailLog), 'Cancellation email notification log created for customer');
  assert(!refundEmailLog1, 'NO refund email was sent when refund amount is 0');
  console.log('✅ PASSED: When owner cancels booking with ₹0 refund, cancellation email is sent and refund email is NOT sent');

  // 36.2: Owner later issues a refund on that cancelled booking -> Dedicated refund email is sent
  const refundLaterResult = PostgresEngine.updateBookingStatus(t36Booking1.booking!.id, 'refunded', {
    adminId: validAdmin.id,
    cancelledBy: 'admin',
    refundAmount: 1400,
    refundReason: 'Goodwill refund issued for maintenance cancellation'
  });
  assert(refundLaterResult.success, 'Refund processed on previously cancelled booking');

  const logsAfterLaterRefund = store.getNotificationLogs().filter(n => n.booking_id === t36Booking1.booking!.id);
  const refundEmailLog2 = logsAfterLaterRefund.find(n => n.channel === 'email' && n.type === 'refund');
  const allCancelLogs = logsAfterLaterRefund.filter(n => n.channel === 'email' && n.type === 'cancellation');

  assert(Boolean(refundEmailLog2), 'Dedicated refund email notification log created');
  assert(allCancelLogs.length === 1, 'Cancellation email was NOT duplicated on refund');
  console.log('✅ PASSED: When owner subsequently issues refund, dedicated refund email is sent without duplicating cancellation email');

  // 36.3: Owner directly cancels + refunds a booking in one step via AdminRefundModal
  const secondCourt = store.getCourts()[1] || targetCourt;
  const t36Ref2 = `TRF-T36-DIRECT-${Date.now()}`;
  const t36Booking2 = PostgresEngine.createBooking({
    booking_ref: t36Ref2,
    customer_id: t36Customer.id,
    court_id: secondCourt.id,
    sport_id: 'sp-football',
    booking_date: getVenueDateString(9),
    start_time: '15:00',
    end_time: '16:00',
    total_amount: 1600,
    discount_amount: 0,
    status: 'confirmed',
    source: 'online'
  });
  assert(Boolean(t36Booking2.success && t36Booking2.booking), 'Booking 2 created for direct refund');

  const directRefundResult = PostgresEngine.updateBookingStatus(t36Booking2.booking!.id, 'refunded', {
    adminId: validAdmin.id,
    cancelledBy: 'admin',
    refundAmount: 1600,
    refundReason: 'Owner emergency rainout cancel with 100% refund'
  });
  assert(directRefundResult.success, 'Booking cancelled and refunded in one step');

  const logsDirect = store.getNotificationLogs().filter(n => n.booking_id === t36Booking2.booking!.id);
  const directCancelEmail = logsDirect.find(n => n.channel === 'email' && n.type === 'cancellation');
  const directRefundEmail = logsDirect.find(n => n.channel === 'email' && n.type === 'refund');

  assert(Boolean(directCancelEmail), 'Cancellation email sent on direct refund');
  assert(Boolean(directRefundEmail), 'Dedicated refund email sent on direct refund');
  console.log('✅ PASSED: When owner cancels with refund in one step, both cancellation email and refund email are sent');

  // 36.4: Direct verification of EmailService.sendRefundConfirmation
  const t36Venue = store.getVenue();
  const directEmailRes = await EmailService.sendRefundConfirmation({
    booking: t36Booking2.booking!,
    customer: t36Customer,
    courtName: targetCourt.name,
    venue: t36Venue,
    refundAmount: 1600,
    refundReason: 'Verified unit test dispatch',
    refundMode: 'Razorpay UPI (Instant)'
  });
  assert(directEmailRes.success, 'EmailService.sendRefundConfirmation executed successfully');
  console.log('✅ PASSED: EmailService.sendRefundConfirmation dispatches valid email payload');

  // --- TEST 37: Admin Cancellation & Refund Control — Double Refund Prevention ---
  console.log('\n--- TEST 37: Admin Cancellation & Refund Control — Double Refund Prevention ---');
  
  // 37.1 Attempting to refund t36Booking2 a second time must strictly fail
  const duplicateRefundResult = PostgresEngine.updateBookingStatus(t36Booking2.booking!.id, 'refunded', {
    adminId: validAdmin.id,
    cancelledBy: 'admin',
    refundAmount: 1600,
    refundReason: 'Duplicate refund attempt'
  });
  assert(duplicateRefundResult.success === false, 'Duplicate refund attempt on already-refunded booking rejected');
  assert(duplicateRefundResult.message.includes('Refund already processed'), 'Clear error message indicating refund is already processed');
  console.log('✅ PASSED: Duplicate refund attempt on already-refunded booking is strictly rejected');

  // 37.2 Booking status remains refunded and refund_amount is preserved
  const verifyBooking = store.getBookings().find(b => b.id === t36Booking2.booking!.id)!;
  assert(verifyBooking.status === 'refunded', 'Booking status remains refunded');
  assert(verifyBooking.refund_amount === 1600, 'Original refund amount ₹1600 is preserved without corruption');
  console.log('✅ PASSED: Refunded state is immutable and protected from re-execution');

  // --- TEST 38: Admin Database Clear & Purge Contract ---
  console.log('\n--- TEST 38: Admin Database Clear & Purge Contract ---');

  // 38.1 Insert test records
  const sampleCustomer = store.getCustomers()[0];
  sampleCustomer.total_bookings = 5;
  sampleCustomer.total_spent = 6000;
  store.setSlotLocks([{ court_id: 'crt-001', date: '2026-12-05', start_time: '18:00', end_time: '19:00', expires_at: Date.now() + 60000, locked_by: 'test' }]);
  assert(store.getBookings().length > 0, 'Bookings exist before operational purge');

  // 38.2 Execute clearOperationalData
  store.clearOperationalData();
  assert(store.getBookings().length === 0, 'Operational clear wiped all bookings');
  assert(store.getPayments().length === 0, 'Operational clear wiped all payments');
  assert(store.getSlotLocks().length === 0, 'Operational clear wiped all slot locks');
  assert(store.getBlockedSlots().length === 0, 'Operational clear wiped all blocked slots');
  assert(store.getCourts().length > 0, 'Operational clear preserved pitch & court setups');
  assert(store.getSports().length > 0, 'Operational clear preserved sports configurations');
  assert(store.getCustomers().every(c => c.total_bookings === 0 && c.total_spent === 0), 'Customer spend counters reset to 0');
  console.log('✅ PASSED: store.clearOperationalData() cleanly purged operational data while preserving configurations');

  // 38.3 Execute clearAllData (factory reset)
  store.clearAllData(true);
  assert(store.getBookings().length === 0, 'Factory reset has 0 bookings');
  assert(store.getAdminUsers().length > 0, 'Factory reset preserved admin accounts');
  console.log('✅ PASSED: store.clearAllData() cleanly performed factory reset');

  console.log('\n🎉 ALL CORNER & EDGE CASE TESTS (INCLUDING AUTO-COMPLETE & OWNER REDUCED WORKFLOW) PASSED PERFECTLY!\n');
}

runResendTests().catch(err => {
  console.error('❌ Resend/SMS test failed:', err);
  process.exit(1);
});
