import React, { useState, useEffect } from 'react';
import { Court, DynamicSlot, Coupon } from '../../types/schema';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { RazorpayService } from '../../services/razorpayService';
import { ShieldCheck, Tag, CreditCard, Smartphone, AlertTriangle, X, Timer, PersonStanding } from 'lucide-react';

import { formatTimeRange12h } from '../../utils/formatters';

interface CheckoutModalProps {
  court: Court;
  dateStr: string;
  selectedSlots: DynamicSlot[];
  sessionId: string;
  onClose: () => void;
  onSuccess: (bookingRef: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  court,
  dateStr,
  selectedSlots,
  sessionId,
  onClose,
  onSuccess
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');

  // Lock countdown timer (2 mins)
  const [timeLeft, setTimeLeft] = useState(120);

  // OTP & Payment step
  const [step, setStep] = useState<'details' | 'otp' | 'payment'>('details');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');

  // Payment processing status
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          alert('Your slot hold expired! Please select your slots again.');
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  const rawTotal = selectedSlots.reduce((sum, s) => sum + s.price, 0);
  const discount = appliedCoupon
    ? appliedCoupon.discount_type === 'flat'
      ? appliedCoupon.value
      : Math.round((rawTotal * appliedCoupon.value) / 100)
    : 0;
  const finalTotal = Math.max(0, rawTotal - discount);

  const handleApplyCoupon = () => {
    setCouponError('');
    const coupon = store.getCoupons().find(c => c.code.toUpperCase() === couponCode.trim().toUpperCase());

    if (!coupon) {
      setCouponError('Invalid coupon code');
      return;
    }

    if (rawTotal < coupon.min_amount) {
      setCouponError(`Minimum booking total of ₹${coupon.min_amount} required for this coupon`);
      return;
    }

    setAppliedCoupon(coupon);
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter your full name');
      return;
    }
    if (phone.length < 10) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    setStep('otp');
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpInput.trim() === '1234' || otpInput.length === 4) {
      setStep('payment');
    } else {
      setOtpError('Invalid OTP code. Try entering 1234');
    }
  };

  const handleExecutePayment = (paymentMethod: 'upi' | 'card', forceFail: boolean = false) => {
    setIsProcessingPayment(true);
    setPaymentError('');

    setTimeout(() => {
      // 1. Get or Create Customer
      const customers = store.getCustomers();
      let customer = customers.find(c => c.phone === phone);
      if (!customer) {
        customer = {
          id: `cust-${Date.now()}`,
          name,
          phone,
          email,
          created_at: new Date().toISOString(),
          total_bookings: 1,
          total_spent: finalTotal,
          no_show_count: 0,
          is_blacklisted: false
        };
        customers.push(customer);
        store.setCustomers(customers);
      }

      const sports = store.getSports();
      const courtSportId = court.sport_ids[0] || sports[0].id;

      // 2. Create pending DB Booking
      const firstSlot = selectedSlots[0];
      const lastSlot = selectedSlots[selectedSlots.length - 1];
      const bookingRef = `TRF-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const dbResult = PostgresEngine.createBooking({
        booking_ref: bookingRef,
        customer_id: customer.id,
        court_id: court.id,
        sport_id: courtSportId,
        booking_date: dateStr,
        start_time: firstSlot.start_time,
        end_time: lastSlot.end_time,
        source: 'online',
        status: 'pending_payment',
        total_amount: finalTotal,
        discount_amount: discount,
        coupon_id: appliedCoupon?.id
      });

      if (!dbResult.success || !dbResult.booking) {
        setIsProcessingPayment(false);
        setPaymentError(dbResult.message);
        return;
      }

      const booking = dbResult.booking;

      // 3. Create Razorpay order
      const order = RazorpayService.createOrder(booking.id, finalTotal);

      // 4. Simulate Razorpay Webhook Callback
      const webhookResult = RazorpayService.processWebhook({
        event: forceFail ? 'payment.failed' : 'payment.captured',
        payment_id: `pay_live_${Date.now()}`,
        order_id: order.order_id,
        method: paymentMethod,
        signature: 'simulated_valid_signature_hmac_sha256'
      });

      setIsProcessingPayment(false);

      if (webhookResult.success) {
        onSuccess(booking.booking_ref);
      } else {
        setPaymentError(webhookResult.message);
      }
    }, 1200);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl animate-modalScaleIn text-on-surface">
        {/* Stitch Header */}
        <div className="p-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '24px' }}>sports_soccer</span>
            <h3 className="font-headline font-bold text-xl text-primary">Checkout & Payment</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stitch Step Tracker */}
        <div className="px-6 pt-4 pb-2 bg-white">
          <div className="flex items-center justify-between text-xs font-headline font-bold uppercase tracking-wider mb-2">
            <span className={step === 'details' ? 'text-primary' : 'text-on-surface-variant'}>1. Details</span>
            <span className={step === 'otp' ? 'text-primary' : 'text-on-surface-variant'}>2. OTP Verification</span>
            <span className={step === 'payment' ? 'text-primary' : 'text-on-surface-variant'}>3. Payment</span>
          </div>
          <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: step === 'details' ? '33%' : step === 'otp' ? '66%' : '100%'
              }}
            ></div>
          </div>
        </div>

        {/* Stitch Slot Hold Timer Banner */}
        <div className="bg-primary/10 border-y border-primary/20 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            <span className="font-headline font-bold text-xs text-primary">Slot held exclusively for you</span>
          </div>
          <div className="font-headline text-base font-extrabold text-primary countdown-pulse bg-white px-3 py-0.5 rounded-md border border-primary/30 shadow-sm">
            {formatTimer(timeLeft)}
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {/* Summary Box */}
          <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 space-y-2">
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span className="font-medium">Arena / Court:</span>
              <span className="font-headline font-bold text-on-surface text-sm">{court.name}</span>
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span className="font-medium">Date & Slot Time:</span>
              <span className="font-headline font-bold text-primary text-xs">
                {dateStr} | {formatTimeRange12h(selectedSlots[0]?.start_time, selectedSlots[selectedSlots.length - 1]?.end_time)} ({selectedSlots.length} slot)
              </span>
            </div>
            <div className="border-t border-outline-variant/30 pt-2 flex justify-between items-center">
              <span className="text-xs font-semibold text-on-surface-variant">Total Payable:</span>
              <div className="text-right">
                {discount > 0 && <span className="line-through text-on-surface-variant text-xs mr-2">₹{rawTotal}</span>}
                <span className="font-headline text-2xl font-extrabold text-primary">₹{finalTotal}</span>
              </div>
            </div>
          </div>

          {/* STEP 1: Contact Form */}
          {step === 'details' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Mobile Number (WhatsApp) *</label>
                  <div className="flex gap-2">
                    <span className="bg-surface-container-high border border-outline-variant px-3 py-2.5 rounded-lg text-xs font-bold text-on-surface flex items-center">+91</span>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="9876543210"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                      className="form-input flex-1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="rahul@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>

              {/* Coupon Section */}
              <div className="pt-3 border-t border-outline-variant/30">
                <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Apply Coupon Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="WELCOME100 or TURF20"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value)}
                    className="form-input uppercase font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="btn-secondary px-4 py-2 text-xs font-bold shrink-0 flex items-center gap-1"
                  >
                    <Tag className="w-3.5 h-3.5 text-primary" /> Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="text-xs text-primary font-bold mt-1.5 flex items-center gap-1">
                    ✓ Coupon '{appliedCoupon.code}' applied (-₹{discount})
                  </p>
                )}
                {couponError && <p className="text-xs text-red-600 font-semibold mt-1.5">{couponError}</p>}
              </div>

              <button type="submit" className="btn-cta w-full py-3 text-sm font-headline uppercase tracking-wider shadow-md">
                Proceed to Mobile Verification
              </button>
            </form>
          )}

          {/* STEP 2: Phone OTP Verification */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-center py-2">
              <div className="bg-primary/10 p-4 rounded-xl border border-primary/20 text-xs text-on-surface">
                Enter the 4-digit verification code sent via WhatsApp to <strong>+91 {phone}</strong>
                <p className="text-[11px] text-on-surface-variant mt-1.5 font-medium">
                  (Demo Master OTP: <code className="bg-white px-2 py-0.5 rounded border border-primary/30 font-bold text-primary">1234</code>)
                </p>
              </div>

              <input
                type="text"
                maxLength={4}
                autoFocus
                placeholder="1234"
                value={otpInput}
                onChange={e => setOtpInput(e.target.value)}
                className="form-input text-center font-mono text-2xl tracking-[0.5em] py-3 max-w-xs mx-auto block"
              />

              {otpError && <p className="text-xs text-red-600 font-semibold">{otpError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="btn-secondary flex-1 py-2.5 text-xs font-bold"
                >
                  Back
                </button>
                <button type="submit" className="btn-primary flex-1 py-2.5 text-xs font-bold">
                  Verify OTP & Proceed
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Razorpay Payment Simulation */}
          {step === 'payment' && (
            <div className="space-y-4 text-center py-2">
              <div className="flex items-center justify-between p-4 bg-surface-container-low border border-outline-variant/40 rounded-xl text-left">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                  <div>
                    <p className="font-headline font-bold text-sm text-on-surface">Razorpay Gateway Simulation</p>
                    <p className="text-xs text-on-surface-variant">Amount: ₹{finalTotal}</p>
                  </div>
                </div>
                <span className="bg-primary text-white text-[10px] px-2.5 py-0.5 rounded-full font-headline font-bold uppercase tracking-wider">
                  TEST MODE
                </span>
              </div>

              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 text-left flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="font-medium">{paymentError}</div>
                </div>
              )}

              {isProcessingPayment ? (
                <div className="py-8 space-y-3">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-sm font-headline font-bold text-on-surface">Verifying Payment & Syncing DB Lock...</p>
                  <p className="text-xs text-on-surface-variant">HMAC Webhook verification in progress...</p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-on-surface-variant font-medium">Select instant payment method:</p>

                  <button
                    onClick={() => handleExecutePayment('upi', false)}
                    className="btn-cta w-full text-xs font-headline font-bold uppercase tracking-wider flex items-center justify-center gap-2 py-3 shadow-md"
                  >
                    <Smartphone className="w-4 h-4" /> Pay via UPI / GooglePay / PhonePe (Simulate Success)
                  </button>

                  <button
                    onClick={() => handleExecutePayment('card', false)}
                    className="btn-secondary w-full text-xs font-bold flex items-center justify-center gap-2 py-3"
                  >
                    <CreditCard className="w-4 h-4 text-primary" /> Pay via Credit / Debit Card (Simulate Success)
                  </button>

                  <button
                    onClick={() => handleExecutePayment('upi', true)}
                    className="w-full py-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4" /> Simulate Payment Failure / Bank Decline
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
