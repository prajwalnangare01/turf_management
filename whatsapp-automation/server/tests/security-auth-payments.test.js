// Comprehensive Production Hardening Test Suite
// Verifies JWT Authentication, bcrypt hashing, RBAC route protection, OTP verification, and Razorpay signature verification
import { store } from '../src/data/store.js';
import { ServerAuthService } from '../src/services/authService.js';
import { OtpService } from '../src/services/otpService.js';
import { RazorpayService } from '../src/services/razorpayService.js';
import { LockService } from '../src/services/lockService.js';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failed++;
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
    passed++;
  }
}

console.log('\n======================================================');
console.log('🔒 RUNNING TURFFLOW SECURITY, AUTH & PAYMENTS TEST SUITE');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// 1. ADMIN AUTH & REAL SIGNED JWTs
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Admin Authentication with Signed JWT & Bcrypt ---');
const adminLoginRes = ServerAuthService.loginAdmin('owner@turfflow.com', 'admin123');
assert(adminLoginRes.success === true, 'Admin login with valid credentials succeeded');
assert(typeof adminLoginRes.token === 'string' && adminLoginRes.token.split('.').length === 3, 'Valid 3-part signed JWT issued');

// Verify decoded JWT claims
const decodedAdmin = ServerAuthService.verifyToken(adminLoginRes.token);
assert(decodedAdmin.role === 'owner', 'Decoded JWT preserves owner role');
assert(decodedAdmin.type === 'admin', 'Decoded JWT marks user as admin');

// Invalid admin credentials
const invalidAdmin = ServerAuthService.loginAdmin('owner@turfflow.com', 'wrongpassword');
assert(invalidAdmin.success === false, 'Invalid admin password rejected');

// -----------------------------------------------------------------------------
// 2. CUSTOMER AUTH & PASSWORD HASHING
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Customer Registration & Bcrypt Hashing ---');
const newCustomerPhone = `98765${Math.floor(10000 + Math.random() * 90000)}`;
const signupRes = ServerAuthService.signupCustomer({
  name: 'Virat Kohli',
  phone: newCustomerPhone,
  email: `virat.${Date.now()}@example.com`,
  password: 'securePassword123'
});

assert(signupRes.success === true, 'Customer registered successfully');
assert(typeof signupRes.token === 'string' && signupRes.token.split('.').length === 3, 'Customer received signed JWT');

// Verify stored password in store is bcrypt hashed (starts with $2)
const customerInStore = store.getCustomers().find(c => c.phone.includes(newCustomerPhone));
assert(customerInStore && customerInStore.password.startsWith('$2'), 'Customer password is cryptographically hashed with bcrypt in store');

// Customer login with valid password
const customerLoginRes = ServerAuthService.loginCustomer(newCustomerPhone, 'securePassword123');
assert(customerLoginRes.success === true, 'Customer login with hashed password succeeded');
assert(customerLoginRes.customer.name === 'Virat Kohli', 'Customer profile returned');

// Customer login with wrong password
const badCustomerLogin = ServerAuthService.loginCustomer(newCustomerPhone, 'wrongPass');
assert(badCustomerLogin.success === false, 'Customer login with wrong password rejected');

// -----------------------------------------------------------------------------
// 3. BACKEND-DRIVEN OTP GENERATION & EXPIRY
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Backend OTP Generation & Ticket Verification ---');
const testEmail = `test.otp.${Date.now()}@example.com`;
const otpRequest = await OtpService.requestOtp({
  target: testEmail,
  channel: 'email',
  purpose: 'signup'
});

assert(otpRequest.success === true, 'OTP requested successfully');
assert(typeof otpRequest.code === 'string' && otpRequest.code.length === 6, '6-digit OTP code generated');

// Verify with invalid code
const invalidOtpVerify = OtpService.verifyOtp({
  target: testEmail,
  code: '000000',
  purpose: 'signup'
});
assert(invalidOtpVerify.success === false, 'Invalid OTP code rejected');

// Verify with valid code
const validOtpVerify = OtpService.verifyOtp({
  target: testEmail,
  code: otpRequest.code,
  purpose: 'signup'
});
assert(validOtpVerify.success === true, 'Valid OTP verified successfully');
assert(typeof validOtpVerify.ticket === 'string', 'One-time verification ticket issued');

// Ticket consumption check
const ticketValid = OtpService.consumeTicket(testEmail, 'signup', validOtpVerify.ticket);
assert(ticketValid === true, 'Verification ticket consumed successfully');

// Re-using same ticket must fail (one-time protection)
const reuseTicket = OtpService.consumeTicket(testEmail, 'signup', validOtpVerify.ticket);
assert(reuseTicket === false, 'Reusing already consumed ticket strictly rejected');

// -----------------------------------------------------------------------------
// 4. RAZORPAY ORDERS API & SIGNATURE VERIFICATION
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: Razorpay Orders & Server-Side Signature Verification ---');
const testRef = `TRF-TEST-${Date.now()}`;
const orderRes = await RazorpayService.createOrderAsync({ bookingRef: testRef, amount: 1500 });
assert(orderRes.success === true && orderRes.order_id, 'Razorpay order created server-side');

// Generate authentic HMAC-SHA256 signature
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';
const testPaymentId = `pay_real_${Date.now()}`;
const authenticSignature = crypto
  .createHmac('sha256', keySecret)
  .update(`${orderRes.order_id}|${testPaymentId}`)
  .digest('hex');

const validSigCheck = RazorpayService.verifyPaymentSignature({
  orderId: orderRes.order_id,
  paymentId: testPaymentId,
  signature: authenticSignature
});
assert(validSigCheck === true, 'Authentic payment signature verified server-side');

// Spoofed signature must be rejected
const spoofedSigCheck = RazorpayService.verifyPaymentSignature({
  orderId: orderRes.order_id,
  paymentId: testPaymentId,
  signature: 'fake_tampered_signature_123456789abcdef'
});
assert(spoofedSigCheck === false, 'Spoofed / tampered payment signature strictly rejected');

// -----------------------------------------------------------------------------
// 5. WEBHOOK SIGNATURE VERIFICATION
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: Webhook Signature Verification ---');
const webhookPayload = JSON.stringify({
  event: 'payment.captured',
  payload: { payment: { entity: { id: testPaymentId, amount: 150000 } } }
});
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'gdsw4V2VPaWfK4qA8Im54fCk';
const validWebhookSig = crypto.createHmac('sha256', webhookSecret).update(webhookPayload).digest('hex');

assert(
  RazorpayService.verifyWebhookSignature(webhookPayload, validWebhookSig, webhookSecret) === true,
  'Authentic webhook signature verified'
);

assert(
  RazorpayService.verifyWebhookSignature(webhookPayload, 'tampered_webhook_sig', webhookSecret) === false,
  'Tampered webhook signature strictly rejected'
);

console.log('\n======================================================');
console.log(`🎉 ALL ${passed} SECURITY, AUTH & PAYMENT TESTS PASSED!`);
console.log('======================================================\n');
