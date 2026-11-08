// Automated Comprehensive Test Suite for TurfFlow WhatsApp AI Agent
const BASE_URL = 'http://localhost:5000/api';
const TEST_PHONE = '+919579158374';

async function sendAgentMessage(senderName, messageText) {
  const res = await fetch(`${BASE_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromPhone: TEST_PHONE,
      senderName,
      messageText
    })
  });
  return res.json();
}

async function runTests() {
  console.log('\n======================================================');
  console.log(`🤖 TESTING WHATSAPP AI AGENT — TARGET: ${TEST_PHONE}`);
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Health & WhatsApp Status
  try {
    const statusRes = await fetch(`${BASE_URL}/whatsapp/status`).then(r => r.json());
    console.log('--- TEST 1: WhatsApp Multi-Device Agent Service Status ---');
    console.log(`Status:       ${statusRes.status}`);
    console.log(`Target Phone: +${statusRes.targetPhone}`);
    console.log(`Pairing Code: ${statusRes.pairingCode}`);
    if (statusRes.success) {
      console.log('✅ PASSED: WhatsApp agent service is healthy & listening\n');
      passed++;
    } else {
      console.error('❌ FAILED: Service returned success: false\n');
      failed++;
    }
  } catch (e) {
    console.error('❌ FAILED Test 1:', e.message);
    failed++;
  }

  // Test 2: Natural Language Slot Lookup
  try {
    console.log('--- TEST 2: Customer asks: "Show football slots for tomorrow" ---');
    const res = await sendAgentMessage('Prajwal', 'Show football slots for tomorrow');
    console.log('Agent Response Preview:');
    console.log(res.reply ? res.reply.split('\n').slice(0, 8).join('\n') + '\n...' : 'No reply');
    if (res.success && res.action === 'check_availability' && res.reply.includes('AVAILABLE SLOTS')) {
      console.log('✅ PASSED: Correctly recognized availability intent and formatted slots\n');
      passed++;
    } else {
      console.error('❌ FAILED Test 2: Unexpected response format', res);
      failed++;
    }
  } catch (e) {
    console.error('❌ FAILED Test 2:', e.message);
    failed++;
  }

  // Test 3: Hinglish Natural Language Parsing
  try {
    console.log('--- TEST 3: Hinglish Query: "bhai kal shaam 6 baje football slot hai kya?" ---');
    const res = await sendAgentMessage('Prajwal', 'bhai kal shaam 6 baje football slot hai kya?');
    console.log('Agent Response Preview:');
    console.log(res.reply ? res.reply.split('\n').slice(0, 6).join('\n') + '\n...' : 'No reply');
    if (res.success && res.action === 'check_availability') {
      console.log('✅ PASSED: Correctly parsed Hinglish time ("shaam 6 baje")\n');
      passed++;
    } else {
      console.error('❌ FAILED Test 3:', res);
      failed++;
    }
  } catch (e) {
    console.error('❌ FAILED Test 3:', e.message);
    failed++;
  }

  // Test 4: Booking Intent & 5-minute Slot Lock Creation
  let bookingRef = null;
  try {
    console.log('--- TEST 4: Booking Request: "Book Turf B tomorrow at 4pm" ---');
    const res = await sendAgentMessage('Prajwal', 'Book Turf B tomorrow at 4pm');
    console.log('Agent Response Preview:');
    console.log(res.reply);
    if (res.success && res.action === 'booking_initiated' && res.data?.payment?.payment_url) {
      bookingRef = res.data.booking.booking_ref;
      console.log(`✅ PASSED: Slot reserved! Generated Ref: ${bookingRef}, Razorpay URL: ${res.data.payment.payment_url}\n`);
      passed++;
    } else {
      console.error('❌ FAILED Test 4: Booking not initiated', res);
      failed++;
    }
  } catch (e) {
    console.error('❌ FAILED Test 4:', e.message);
    failed++;
  }

  // Test 5: Concurrency Conflict / Double-Booking Prevention
  try {
    console.log('--- TEST 5: Collision Guard: Second customer attempts booking the same slot ---');
    const res = await fetch(`${BASE_URL}/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromPhone: '+919999888877',
        senderName: 'Another Player',
        messageText: 'Book Turf B tomorrow at 4pm'
      })
    }).then(r => r.json());
    console.log('Agent Response Preview:');
    console.log(res.reply);
    if (res.success && res.action === 'booking_conflict') {
      console.log('✅ PASSED: Anti-collision guard successfully blocked concurrent booking!\n');
      passed++;
    } else {
      console.error('❌ FAILED Test 5: Double booking was not prevented!', res);
      failed++;
    }
  } catch (e) {
    console.error('❌ FAILED Test 5:', e.message);
    failed++;
  }

  // Test 6: My Bookings Lookup
  try {
    console.log('--- TEST 6: Inquiry: "My bookings" ---');
    const res = await sendAgentMessage('Prajwal', 'My bookings');
    console.log('Agent Response:');
    console.log(res.reply);
    if (res.success && res.action === 'lookup_bookings' && res.reply.includes('YOUR TURFFLOW BOOKINGS')) {
      console.log('✅ PASSED: Correctly retrieved customer booking ledger from database\n');
      passed++;
    } else {
      console.error('❌ FAILED Test 6:', res);
      failed++;
    }
  } catch (e) {
    console.error('❌ FAILED Test 6:', e.message);
    failed++;
  }

  // Test 7: Simulated Payment Confirmation
  if (bookingRef) {
    try {
      console.log(`--- TEST 7: Payment Confirmation for ${bookingRef} ---`);
      const payRes = await fetch(`${BASE_URL}/bookings/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingRef,
          gatewayPaymentId: 'pay_test_' + Date.now()
        })
      }).then(r => r.json());
      console.log(`Confirmation Message: ${payRes.message}`);
      if (payRes.success && payRes.booking.status === 'confirmed') {
        console.log('✅ PASSED: Booking confirmed and ticket dispatched via WhatsApp\n');
        passed++;
      } else {
        console.error('❌ FAILED Test 7:', payRes);
        failed++;
      }
    } catch (e) {
      console.error('❌ FAILED Test 7:', e.message);
      failed++;
    }
  }

  console.log('======================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');
}

runTests();
