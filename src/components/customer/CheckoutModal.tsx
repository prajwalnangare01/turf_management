import React, { useState, useEffect } from 'react';
import { Customer, Court, DynamicSlot, Coupon, Booking } from '../../types/schema';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { RazorpayService } from '../../services/razorpayService';
import { RedisLockService } from '../../services/redisLockService';
import { ShieldCheck, Tag, CreditCard, Smartphone, AlertTriangle, X, Timer, PersonStanding } from 'lucide-react';
import { formatTimeRange12h } from '../../utils/formatters';

interface CheckoutModalProps {
  court: Court;
  dateStr: string;
  selectedSlots: DynamicSlot[];
  sessionId: string;
  currentCustomer?: Customer | null;
  onClose: () => void;
  onSuccess: (bookingRef: string) => void;
}

export interface ContiguousSlotBlock {
  start_time: string;
  end_time: string;
  slots: DynamicSlot[];
  blockPrice: number;
}

/**
 * Group non-contiguous slots into contiguous time blocks
 */
export function groupContiguousSlots(slots: DynamicSlot[]): ContiguousSlotBlock[] {
  if (slots.length === 0) return [];
  
  const sorted = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const blocks: ContiguousSlotBlock[] = [];

  let currentBlock: ContiguousSlotBlock = {
    start_time: sorted[0].start_time,
    end_time: sorted[0].end_time,
    slots: [sorted[0]],
    blockPrice: sorted[0].price
  };

  for (let i = 1; i < sorted.length; i++) {
    const slot = sorted[i];
    if (slot.start_time === currentBlock.end_time) {
      currentBlock.end_time = slot.end_time;
      currentBlock.slots.push(slot);
      currentBlock.blockPrice += slot.price;
    } else {
      blocks.push(currentBlock);
      currentBlock = {
        start_time: slot.start_time,
        end_time: slot.end_time,
        slots: [slot],
        blockPrice: slot.price
      };
    }
  }
  blocks.push(currentBlock);
  return blocks;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  court,
  dateStr,
  selectedSlots,
  sessionId,
  currentCustomer,
  onClose,
  onSuccess
}) => {
  const [name, setName] = useState(currentCustomer?.name || '');
  const [phone, setPhone] = useState(currentCustomer?.phone || '');
  const [email, setEmail] = useState(currentCustomer?.email || '');
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

  const contiguousBlocks = groupContiguousSlots(selectedSlots);
  const formattedSlotsSummary = contiguousBlocks
    .map(b => formatTimeRange12h(b.start_time, b.end_time))
    .join(', ');

  const handleApplyCoupon = () => {
    setCouponError('');
    const coupons = store.getCoupons();
    const coupon = coupons.find(c => c.code.toUpperCase() === couponCode.trim().toUpperCase() && new Date(c.valid_to) >= new Date());

    if (!coupon) {
      setCouponError('Invalid or expired coupon code.');
      setAppliedCoupon(null);
      return;
    }

    if (coupon.min_amount && rawTotal < coupon.min_amount) {
      setCouponError(`Minimum booking amount of ₹${coupon.min_amount} required for this coupon.`);
      setAppliedCoupon(null);
      return;
    }

    setAppliedCoupon(coupon);
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) return;
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

      // 2. Create pending DB Bookings for EACH contiguous block
      const createdBookings: Booking[] = [];

      for (let i = 0; i < contiguousBlocks.length; i++) {
        const block = contiguousBlocks[i];
        const blockRawRatio = rawTotal > 0 ? block.blockPrice / rawTotal : 1 / contiguousBlocks.length;
        const blockDiscount = Math.round(discount * blockRawRatio);
        const blockTotal = Math.max(0, block.blockPrice - blockDiscount);

        const bookingRef = `TRF-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const dbResult = PostgresEngine.createBooking({
          booking_ref: bookingRef,
          customer_id: customer.id,
          court_id: court.id,
          sport_id: courtSportId,
          booking_date: dateStr,
          start_time: block.start_time,
          end_time: block.end_time,
          source: 'online',
          status: 'pending_payment',
          total_amount: blockTotal,
          discount_amount: blockDiscount,
          coupon_id: appliedCoupon?.id
        });

        if (!dbResult.success || !dbResult.booking) {
          setIsProcessingPayment(false);
          setPaymentError(dbResult.message);
          return;
        }
        createdBookings.push(dbResult.booking);
      }

      const primaryBooking = createdBookings[0];

      // 3. Create Razorpay order
      const order = RazorpayService.createOrder(primaryBooking.id, finalTotal);

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
        // Confirm any secondary contiguous block bookings
        for (let i = 1; i < createdBookings.length; i++) {
          PostgresEngine.updateBookingStatus(createdBookings[i].id, 'confirmed');
        }

        // Release Redis locks for all contiguous blocks
        for (const block of contiguousBlocks) {
          RedisLockService.releaseLocksForBooking(court.id, dateStr, block.start_time, block.end_time, sessionId);
        }

        onSuccess(primaryBooking.booking_ref);
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
            <h3 className="font-headline font-bold text-xl text-primary">Confirm Pitch Reservation</h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-full text-xs font-mono font-bold">
              <Timer className="w-3.5 h-3.5 text-amber-700 animate-pulse" /> Hold Expires: {formatTimer(timeLeft)}
            </div>

            <button
              onClick={onClose}
              className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Box */}
          <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 space-y-2">
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span className="font-medium">Arena / Court:</span>
              <span className="font-headline font-bold text-on-surface text-sm">{court.name}</span>
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span className="font-medium">Date & Slot Time:</span>
              <span className="font-headline font-bold text-primary text-xs text-right max-w-[280px]">
                {dateStr} | {formattedSlotsSummary} ({selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''})
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
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Mobile Phone (+91) *</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="form-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Email (For e-receipt & calendar invite)</label>
                <input
                  type="email"
                  placeholder="rahul@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input text-xs"
                />
              </div>

              {/* Coupon Code Input */}
              <div className="pt-2 border-t border-outline-variant/30">
                <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Have a Promo / Coupon Code?</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. TURF100 or WEEKEND20"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    className="form-input text-xs uppercase font-mono tracking-wider flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="btn-secondary text-xs px-4 py-2 font-bold"
                  >
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="text-xs text-primary font-bold mt-1.5 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Coupon '{appliedCoupon.code}' applied! Saved ₹{discount}
                  </p>
                )}
                {couponError && (
                  <p className="text-xs text-error font-medium mt-1">{couponError}</p>
                )}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="btn-cta text-xs px-6 py-3 font-headline font-bold uppercase tracking-wider shadow-md"
                >
                  Verify Mobile via OTP →
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Phone OTP Verification */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 text-xs text-primary space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> SMS OTP Sent to +91 {phone}
                </p>
                <p className="text-on-surface-variant">
                  Enter the 4-digit verification code sent to your mobile. <strong className="text-primary font-bold">(Demo OTP: 1234)</strong>
                </p>
              </div>

              {otpError && (
                <div className="text-xs text-error font-medium bg-error/10 p-2.5 rounded-lg">
                  {otpError}
                </div>
              )}

              <div>
                <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Enter 4-Digit OTP Code</label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  placeholder="1234"
                  value={otpInput}
                  onChange={e => setOtpInput(e.target.value)}
                  className="form-input text-lg font-mono font-bold tracking-widest text-center"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="btn-secondary text-xs px-4 py-2 font-bold"
                >
                  ← Back to Details
                </button>
                <button
                  type="submit"
                  className="btn-cta text-xs px-6 py-2.5 font-headline font-bold uppercase tracking-wider shadow-md"
                >
                  Verify & Proceed to Payment
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Razorpay Payment Simulation */}
          {step === 'payment' && (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-xl text-xs flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Phone Verified (+91 {phone})
                </span>
                <span className="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-mono font-bold text-[10px]">VERIFIED</span>
              </div>

              {paymentError && (
                <div className="bg-error/10 border border-error/30 text-error p-3 rounded-xl text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-headline font-bold text-sm text-primary">Select Razorpay Payment Gateway Method:</h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    disabled={isProcessingPayment}
                    onClick={() => handleExecutePayment('upi')}
                    className="p-4 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 transition text-left space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between font-headline font-bold text-xs text-primary">
                      <span className="flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-primary" /> Instant UPI</span>
                      <span className="text-[10px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded font-bold">RECOMMENDED</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-medium">GPay, PhonePe, Paytm, BHIM UPI</p>
                  </button>

                  <button
                    disabled={isProcessingPayment}
                    onClick={() => handleExecutePayment('card')}
                    className="p-4 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 transition text-left space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between font-headline font-bold text-xs text-primary">
                      <span className="flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-primary" /> Credit / Debit Card</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-medium">Visa, Mastercard, RuPay, Amex</p>
                  </button>
                </div>

                {/* Simulation controls for decline/failure */}
                <div className="pt-4 border-t border-outline-variant/30 text-[11px] text-on-surface-variant space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-on-surface">Razorpay Sandbox Simulator Controls:</span>
                    <button
                      disabled={isProcessingPayment}
                      onClick={() => handleExecutePayment('upi', true)}
                      className="text-error underline hover:text-error/80 font-bold"
                    >
                      Simulate Payment Failure Path 🛑
                    </button>
                  </div>
                </div>
              </div>

              {isProcessingPayment && (
                <div className="py-6 text-center space-y-2">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="font-headline font-bold text-xs text-primary">Connecting to Razorpay Secure Gateway...</p>
                  <p className="text-[11px] text-on-surface-variant">Processing webhook payload and updating PostgreSQL transaction log</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
