import React, { useState, useEffect } from 'react';
import { Court, DynamicSlot, Coupon } from '../../types/schema';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { RazorpayService } from '../../services/razorpayService';
import { RedisLockService } from '../../services/redisLockService';
import { Clock, ShieldCheck, Tag, CreditCard, Smartphone, CheckCircle, AlertTriangle, X } from 'lucide-react';

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

  // Lock countdown timer
  const [timeLeft, setTimeLeft] = useState(300); // 5 mins in seconds

  // OTP Step
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
          alert('Your slot lock expired! Please select your slots again.');
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

      // Check duplicate booking warning
      const sports = store.getSports();
      const courtSportId = court.sport_ids[0] || sports[0].id;

      // 2. Create pending DB Booking for first selected slot
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
    <div className="modal-backdrop">
      <div className="bg-[#131b2e] border border-[#24304f] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 bg-[#0b0f19] border-b border-[#24304f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-lg text-white">Complete Booking</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lock Timer Banner */}
        <div className="bg-cyan-500/10 border-b border-cyan-500/20 px-4 py-2 flex items-center justify-between text-xs text-cyan-300">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
            Slot Lock Reserved
          </span>
          <span className="font-mono text-sm font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-200">
            {formatTimer(timeLeft)}
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-5">
          {/* Summary Box */}
          <div className="bg-[#0f172a] p-4 rounded-xl border border-[#24304f] text-xs space-y-2">
            <div className="flex justify-between font-medium text-gray-300">
              <span>Court:</span>
              <span className="text-white font-semibold">{court.name}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Date & Time:</span>
              <span className="text-emerald-400 font-semibold">
                {dateStr} | {selectedSlots[0]?.start_time} - {selectedSlots[selectedSlots.length - 1]?.end_time}
              </span>
            </div>
            <div className="border-t border-[#24304f] pt-2 flex justify-between text-sm">
              <span className="text-gray-400">Total Amount:</span>
              <div className="text-right">
                {discount > 0 && <span className="line-through text-gray-500 mr-2">₹{rawTotal}</span>}
                <span className="text-emerald-400 font-bold text-base">₹{finalTotal}</span>
              </div>
            </div>
          </div>

          {/* STEP 1: Contact Details */}
          {step === 'details' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Mobile Number (WhatsApp) *</label>
                <div className="flex gap-2">
                  <span className="bg-[#0f172a] border border-[#24304f] text-gray-400 text-xs flex items-center px-3 rounded-lg font-medium">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="rahul@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-field"
                />
              </div>

              {/* Coupon Section */}
              <div className="pt-2 border-t border-[#24304f]">
                <label className="block text-xs font-semibold text-gray-300 mb-1">Apply Coupon</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="WELCOME100 or TURF20"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value)}
                    className="input-field font-mono text-xs uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="btn btn-secondary text-xs px-3 shrink-0 flex items-center gap-1"
                  >
                    <Tag className="w-3.5 h-3.5 text-emerald-400" /> Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="text-xs text-emerald-400 mt-1 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Coupon '{appliedCoupon.code}' applied (-₹{discount})
                  </p>
                )}
                {couponError && <p className="text-xs text-red-400 mt-1">{couponError}</p>}
              </div>

              <button type="submit" className="btn btn-primary w-full mt-4 text-sm font-bold">
                Proceed to Verification
              </button>
            </form>
          )}

          {/* STEP 2: Phone OTP Verification */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-center py-2">
              <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-xs text-emerald-300">
                Enter the 4-digit OTP sent via SMS/WhatsApp to <strong>+91 {phone}</strong>
                <p className="text-[11px] text-gray-400 mt-1">(Demo OTP: <code className="bg-emerald-950 px-1 py-0.5 rounded text-emerald-300">1234</code>)</p>
              </div>

              <input
                type="text"
                maxLength={4}
                autoFocus
                placeholder="1234"
                value={otpInput}
                onChange={e => setOtpInput(e.target.value)}
                className="input-field text-center font-mono text-2xl tracking-[0.5em] py-3"
              />

              {otpError && <p className="text-xs text-red-400">{otpError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="btn btn-secondary flex-1 text-xs"
                >
                  Back
                </button>
                <button type="submit" className="btn btn-primary flex-1 text-xs font-bold">
                  Verify & Pay
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Razorpay Payment Simulation */}
          {step === 'payment' && (
            <div className="space-y-4 text-center py-2">
              <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-xl text-left">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-6 h-6 text-emerald-400" />
                  <div>
                    <p className="text-xs font-bold text-white">Razorpay Secure Checkout</p>
                    <p className="text-[10px] text-gray-400">Order Amount: ₹{finalTotal}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-semibold">
                  LIVE API SIMULATOR
                </span>
              </div>

              {paymentError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 text-left flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{paymentError}</div>
                </div>
              )}

              {isProcessingPayment ? (
                <div className="py-8 space-y-3">
                  <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs text-gray-300 font-semibold">Processing Razorpay Payment...</p>
                  <p className="text-[10px] text-gray-500">Verifying HMAC webhook signature & DB constraint...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 font-medium">Select payment simulation mode:</p>
                  
                  <button
                    onClick={() => handleExecutePayment('upi', false)}
                    className="btn btn-primary w-full text-xs font-bold flex items-center justify-center gap-2 py-3"
                  >
                    <Smartphone className="w-4 h-4" /> Pay via UPI / GPay (Simulate Success)
                  </button>

                  <button
                    onClick={() => handleExecutePayment('card', false)}
                    className="btn btn-secondary w-full text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" /> Pay via Credit/Debit Card (Simulate Success)
                  </button>

                  <button
                    onClick={() => handleExecutePayment('upi', true)}
                    className="btn btn-danger w-full text-xs font-semibold flex items-center justify-center gap-2 opacity-80 hover:opacity-100"
                  >
                    <AlertTriangle className="w-4 h-4" /> Simulate Payment Failure / Decline
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
