/**
 * Automated Verification: Razorpay Hosted Page Expiration on Slot Lock End
 * Verifies that when a slot hold ends (or is cancelled/expired):
 * 1. Razorpay payment link is created in test mode.
 * 2. When lock expires or is released, Razorpay cancel API is called.
 * 3. Hosted link status on Razorpay transitions to 'cancelled'.
 * 4. Fetching the hosted page confirms it is strictly blocked and no longer active.
 */

import assert from 'assert';
import { RazorpayService } from '../src/services/razorpayService.js';
import { BookingService } from '../src/services/bookingService.js';
import { LockService } from '../src/services/lockService.js';
import { store } from '../src/data/store.js';

console.log('\n--- 🧪 TEST: Razorpay Hosted Page Expiration on Slot Lock End ---');

async function runTest() {
  const testRef = `TRF-EXP-${Date.now()}`;
  console.log(`1. Creating real Razorpay Payment Link for hold ${testRef}...`);

  const payment = await RazorpayService.createPaymentLinkAsync({
    bookingId: testRef,
    bookingRef: testRef,
    amount: 1500,
    customerName: 'Rohit Sharma',
    customerPhone: '+919876543210',
    customerEmail: 'rohit@example.com',
    courtName: 'Turf A',
    date: '2026-11-20',
    startTime: '18:00'
  });

  assert(payment.payment_link_id, 'Payment Link ID should be generated');
  assert(payment.payment_link_id.startsWith('plink_'), 'Should be real Razorpay plink ID');
  console.log(`✅ Generated Razorpay Link: ${payment.payment_link_id} -> ${payment.payment_url}`);

  // Create pending booking in store
  const booking = {
    id: `bk-${Date.now()}`,
    booking_ref: testRef,
    court_id: 'crt-001',
    booking_date: '2026-11-20',
    start_time: '18:00',
    customer_phone: '+919876543210',
    status: 'pending_payment',
    payment_link_id: payment.payment_link_id,
    created_at: new Date(Date.now() - 310 * 1000).toISOString() // 5m 10s ago (lock expired!)
  };
  store.getBookings().push(booking);

  // Lock the slot
  LockService.acquireLock('crt-001', '2026-11-20', '18:00', '+919876543210');

  console.log('2. Simulating slot hold timeout (5 minutes elapsed)...');
  const expiredCount = BookingService.expireUnpaidPendingBookings();
  assert(booking.status === 'cancelled', 'Booking status must be cancelled when hold expires');
  console.log(`✅ Booking ${testRef} transitioned to cancelled (Unpaid hold expired)`);

  // Wait 1.5 seconds for Razorpay cancel API to complete
  await new Promise(r => setTimeout(r, 1500));

  console.log('3. Verifying Razorpay hosted payment link status via Razorpay API...');
  const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_TzDkSqPNwT910d';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const checkRes = await fetch(`https://api.razorpay.com/v1/payment_links/${payment.payment_link_id}`, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  const linkData = await checkRes.json();
  console.log(`✅ Razorpay API reports link status: ${linkData.status}`);
  assert.strictEqual(linkData.status, 'cancelled', 'Razorpay payment link status on hosted servers must be cancelled');

  console.log('\n🎉 TEST PASSED: Razorpay hosted page strictly expires and blocks late payments when slot lock ends!\n');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
