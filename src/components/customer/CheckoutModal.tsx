import React, { useState, useEffect, useRef } from 'react';
import { Customer, Court, DynamicSlot, Coupon, Booking } from '../../types/schema';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { RazorpayService } from '../../services/razorpayService';
import { RedisLockService } from '../../services/redisLockService';
import { CouponService } from '../../services/couponService';
import { SupabaseSyncService } from '../../services/supabaseSyncService';
import { normalizeIndianPhone } from '../../utils/venueTime';
import { ShieldCheck, Tag, CreditCard, Smartphone, AlertTriangle, AlertCircle, X, Timer, PersonStanding, Clock, RefreshCw, CalendarCheck2, User, Phone, Mail, IndianRupee, Calendar, MapPin } from 'lucide-react';
import { formatTimeRange12h, formatTime12hPlain, formatTimeRange12hPlain, formatDateDDMMYYYY, formatPhoneNumber } from '../../utils/formatters';
import { TimeOfDayIcon } from '../common/TimeOfDayIcon';

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

  // 5-minute hold target timestamp (computed once on modal mount)
  const [targetExpiryMs] = useState<number>(() => {
    const first = selectedSlots[0];
    const existingLock = first ? RedisLockService.getLock(court.id, dateStr, first.start_time) : undefined;
    const maxExpiry = Date.now() + 300 * 1000;
    return existingLock?.expires_at ? Math.min(existingLock.expires_at, maxExpiry) : maxExpiry;
  });

  // Lock countdown timer in seconds
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    return Math.min(300, Math.max(0, Math.ceil((targetExpiryMs - Date.now()) / 1000)));
  });

  // 5-minute hold expired popup modal state
  const [isHoldExpired, setIsHoldExpired] = useState(false);

  // OTP & Payment step
  const [step, setStep] = useState<'details' | 'otp' | 'payment'>('details');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');

  // Payment processing status
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // Extend locks to 5 minutes once on modal mount
  const hasAcquiredLocksRef = useRef(false);
  useEffect(() => {
    if (!hasAcquiredLocksRef.current) {
      hasAcquiredLocksRef.current = true;
      selectedSlots.forEach(s => {
        RedisLockService.acquireLock(court.id, dateStr, s.start_time, sessionId);
      });
    }
  }, [court.id, dateStr, sessionId, selectedSlots]);

  // Live 1-second countdown timer. If user does not complete in 5 minutes, release holds and show expired popup modal!
  useEffect(() => {
    if (isHoldExpired) return;

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((targetExpiryMs - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        // Release all held slots across local and Supabase stores
        selectedSlots.forEach(s => {
          RedisLockService.releaseLock(court.id, dateStr, s.start_time, sessionId);
        });
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('turfflow_pending_checkout');
        }
        setIsHoldExpired(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetExpiryMs, court.id, dateStr, sessionId, selectedSlots, isHoldExpired]);

  const rawTotal = selectedSlots.reduce((sum, s) => sum + s.price, 0);
  const originalRawTotal = selectedSlots.reduce((sum, s) => sum + (s.original_price || s.price), 0);
  const discount = appliedCoupon
    ? appliedCoupon.discount_type === 'flat'
      ? appliedCoupon.value
      : Math.round((rawTotal * appliedCoupon.value) / 100)
    : 0;
  const finalTotal = Math.max(0, rawTotal - discount);

  const contiguousBlocks = groupContiguousSlots(selectedSlots);
  const sortedSlots = [...selectedSlots].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const formattedSlotsSummary = sortedSlots
    .map(s => formatTimeRange12hPlain(s.start_time, s.end_time))
    .join(', ');

  const handleApplyCoupon = () => {
    setCouponError('');
    const validation = CouponService.validateCoupon(couponCode, rawTotal, currentCustomer?.id);
    if (!validation.valid || !validation.coupon) {
      setCouponError(validation.message);
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon(validation.coupon);
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) return;
    // If the customer is already logged in with this exact phone, skip redundant OTP
    if (currentCustomer && currentCustomer.phone === phone) {
      setStep('payment');
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
      const normalizedPhone = normalizeIndianPhone(phone);
      const cleanDigits = phone.replace(/\D/g, '');
      const customers = store.getCustomers();
      let customer = customers.find(c => 
        normalizeIndianPhone(c.phone) === normalizedPhone || 
        c.phone.replace(/\D/g, '').slice(-10) === cleanDigits.slice(-10)
      );

      // EDGE CASE: Check if customer is blacklisted
      if ((currentCustomer && currentCustomer.is_blacklisted) || (customer && customer.is_blacklisted)) {
        setIsProcessingPayment(false);
        setPaymentError('Your customer account has been suspended due to previous no-show violations. Cannot complete reservation.');
        return;
      }

      if (!customer) {
        customer = {
          id: `cust-${Date.now()}`,
          name,
          phone: normalizedPhone,
          email,
          created_at: new Date().toISOString(),
          total_bookings: 0,
          total_spent: 0,
          no_show_count: 0,
          is_blacklisted: false
        };
        customers.push(customer);
        store.setCustomers(customers);
      } else if (email && (!customer.email || customer.email !== email)) {
        customer.email = email;
        store.setCustomers(customers);
      }

      // Sync customer immediately to Supabase
      SupabaseSyncService.syncCustomerToSupabase(customer).catch(err => {
        console.warn('❌ [CheckoutModal] Error syncing customer to Supabase:', err);
      });

      // EDGE CASE: Pre-check locks and DB overlaps across ALL individual slots before creating any booking
      for (const slot of sortedSlots) {
        const hasConflict = store.getBookings().some(b =>
          b.court_id === court.id &&
          b.booking_date === dateStr &&
          (b.status === 'pending_payment' || b.status === 'confirmed') &&
          PostgresEngine.isTimeOverlap(slot.start_time, slot.end_time, b.start_time, b.end_time)
        );

        if (hasConflict) {
          setIsProcessingPayment(false);
          setPaymentError(`Slot interval ${formatTimeRange12hPlain(slot.start_time, slot.end_time)} is no longer available. Please select another slot.`);
          return;
        }
      }

      // Pre-check Redis locks
      for (const slot of sortedSlots) {
        const lock = RedisLockService.getLock(court.id, dateStr, slot.start_time);
        if (lock && lock.locked_by !== sessionId && (!currentCustomer || lock.locked_by !== currentCustomer.id)) {
          setIsProcessingPayment(false);
          setPaymentError(`Slot ${formatTime12hPlain(slot.start_time)} reservation hold expired. Please return to grid and select again.`);
          return;
        }
      }

      const sports = store.getSports();
      const courtSportId = court.sport_ids[0] || sports[0].id;

      // 2. Common Reference, 4-Digit Gate Pass OTP & Transaction ID for entire multi-slot checkout
      const primaryRef = `TRF-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const commonGatePassOtp = primaryRef.slice(-4);
      const commonPaymentId = `pay_live_${Date.now()}`;
      const allSlotsData = sortedSlots.map(s => ({
        start_time: s.start_time,
        end_time: s.end_time,
        price: s.price
      }));

      // Create pending DB Bookings for EACH individual slot linked by common group_ref and gate_pass_otp.
      // Even if slots are continuous (e.g. 6-7 and 7-8), each slot has its own entry pass and can be canceled individually!
      const createdBookings: Booking[] = [];

      for (let i = 0; i < sortedSlots.length; i++) {
        const slot = sortedSlots[i];
        const slotRawRatio = rawTotal > 0 ? slot.price / rawTotal : 1 / sortedSlots.length;
        const slotDiscount = Math.round(discount * slotRawRatio);
        const slotTotal = Math.max(0, slot.price - slotDiscount);

        const bookingRef = i === 0 ? primaryRef : `${primaryRef}-${i + 1}`;

        const dbResult = PostgresEngine.createBooking({
          booking_ref: bookingRef,
          group_ref: primaryRef,
          gate_pass_otp: commonGatePassOtp,
          gateway_payment_id: commonPaymentId,
          total_order_amount: finalTotal,
          all_slots: allSlotsData,
          formatted_slots: formattedSlotsSummary,
          customer_id: customer.id,
          court_id: court.id,
          sport_id: courtSportId,
          booking_date: dateStr,
          start_time: slot.start_time,
          end_time: slot.end_time,
          source: 'online',
          status: 'pending_payment',
          total_amount: slotTotal,
          discount_amount: slotDiscount,
          coupon_id: appliedCoupon?.id
        });

        if (!dbResult.success || !dbResult.booking) {
          // Rollback any earlier created bookings in this batch
          for (const b of createdBookings) {
            PostgresEngine.updateBookingStatus(b.id, 'cancelled');
          }
          setIsProcessingPayment(false);
          setPaymentError(dbResult.message);
          return;
        }
        createdBookings.push(dbResult.booking);
      }

      const primaryBooking = createdBookings[0];

      // CC-S05: Concurrency Guard - Atomic Coupon Redemption
      if (appliedCoupon) {
        const couponRedeemRes = CouponService.atomicRedeem(appliedCoupon.id, primaryBooking.booking_ref);
        if (!couponRedeemRes.success) {
          for (const b of createdBookings) {
            PostgresEngine.updateBookingStatus(b.id, 'cancelled');
          }
          setIsProcessingPayment(false);
          setPaymentError(couponRedeemRes.message);
          return;
        }
      }

      // CC-S03: Persist pending checkout in sessionStorage for mobile UPI app switch recovery
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('turfflow_pending_checkout', JSON.stringify({
          bookingRef: primaryBooking.booking_ref,
          bookingId: primaryBooking.id,
          courtId: court.id,
          dateStr,
          expiresAt: Date.now() + 5 * 60 * 1000
        }));
      }

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
        // Clear pending checkout on successful payment
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('turfflow_pending_checkout');
        }

        // Confirm ALL created individual slot bookings in this multi-slot transaction
        for (let i = 1; i < createdBookings.length; i++) {
          PostgresEngine.updateBookingStatus(createdBookings[i].id, 'confirmed');
          const sibling = store.getBookings().find(b => b.id === createdBookings[i].id);
          if (sibling) {
            sibling.gateway_payment_id = commonPaymentId;
            sibling.group_ref = primaryRef;
            sibling.gate_pass_otp = commonGatePassOtp;
            sibling.total_order_amount = finalTotal;
            sibling.all_slots = allSlotsData;
            sibling.formatted_slots = formattedSlotsSummary;
            SupabaseSyncService.syncBookingToSupabase(sibling).catch(() => {});
          }
        }

        // Release Redis locks for all individual slots
        for (const slot of sortedSlots) {
          RedisLockService.releaseLock(court.id, dateStr, slot.start_time, sessionId);
          if (currentCustomer) {
            RedisLockService.releaseLock(court.id, dateStr, slot.start_time, currentCustomer.id);
          }
        }

        // Explicitly sync confirmed primary booking to Supabase
        const confirmedPrimary = store.getBookings().find(b => b.id === primaryBooking.id);
        if (confirmedPrimary) {
          SupabaseSyncService.syncBookingToSupabase(confirmedPrimary).catch(err => {
            console.warn('❌ [CheckoutModal] Error syncing primary booking:', err);
          });
        }

        onSuccess(primaryBooking.booking_ref);
      } else {
        // Release redeemed coupon usage if payment failed
        if (appliedCoupon) {
          CouponService.releaseUsage(appliedCoupon.id);
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('turfflow_pending_checkout');
        }

        // Rollback all pending bookings on failure
        for (const b of createdBookings) {
          if (b.status === 'pending_payment') {
            PostgresEngine.updateBookingStatus(b.id, 'cancelled');
          }
        }
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
      <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-md shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden">
        {/* Compact Header */}
        <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <CalendarCheck2 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-headline font-bold text-sm sm:text-base text-primary truncate leading-tight">
                Confirm Reservation
              </h3>
              <p className="text-[10.5px] text-on-surface-variant font-medium truncate">
                {court.name} • {formatDateDDMMYYYY(dateStr)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1">
              <Timer className="w-3 h-3 text-amber-700 animate-pulse" /> {formatTimer(timeLeft)}
            </span>

            <button
              type="button"
              onClick={() => {
                selectedSlots.forEach(s => {
                  RedisLockService.releaseLock(court.id, dateStr, s.start_time, sessionId);
                });
                onClose();
              }}
              className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content - Fitted, Zero Internal Scrolling */}
        <div className="p-4 space-y-3">
          {/* Compact 1-Row Summary Strip */}
          <div className="bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="font-bold text-on-surface truncate text-xs flex items-center gap-1">
                {sortedSlots.map((b, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1">
                    {idx > 0 && <span>, </span>}
                    <TimeOfDayIcon time24={b.start_time} className="w-3.5 h-3.5" />
                    <span>{formatTimeRange12hPlain(b.start_time, b.end_time)}</span>
                  </span>
                ))}
              </div>
              <span className="text-[10px] text-on-surface-variant shrink-0">({selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''})</span>
            </div>
            <div className="flex items-baseline gap-1 shrink-0 pl-2">
              <span className="text-[10px] text-on-surface-variant font-semibold">Total:</span>
              {originalRawTotal > finalTotal && (
                <span className="line-through text-on-surface-variant/70 text-[10px]">₹{originalRawTotal}</span>
              )}
              <span className="font-headline text-base sm:text-lg font-extrabold text-primary">₹{finalTotal}</span>
            </div>
          </div>

          {/* STEP 1: Contact Form */}
          {step === 'details' && (
            <form onSubmit={handleSendOtp} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-headline font-bold text-on-surface-variant mb-0.5 flex items-center gap-1">
                    <User className="w-3 h-3 text-primary" /> Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="form-input text-xs py-1.5 px-2.5"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-headline font-bold text-on-surface-variant mb-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-primary" /> Mobile (+91) *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit number"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="form-input text-xs py-1.5 px-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-headline font-bold text-on-surface-variant mb-0.5 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-primary" /> Email (For e-receipt & match pass)
                </label>
                <input
                  type="email"
                  placeholder="rahul@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input text-xs py-1.5 px-2.5"
                />
              </div>

              {/* Promo Code Input */}
              <div className="pt-1 border-t border-outline-variant/30">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Promo Code (Optional)"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    className="form-input text-xs uppercase font-mono tracking-wider flex-1 py-1.5 px-2.5"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="btn-secondary text-xs px-3.5 py-1.5 font-bold shrink-0"
                  >
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="text-[11px] text-primary font-bold mt-1 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Coupon '{appliedCoupon.code}' applied! Saved ₹{discount}
                  </p>
                )}
                {couponError && (
                  <p className="text-[11px] text-error font-medium mt-1">{couponError}</p>
                )}
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  className="btn-cta w-full py-2.5 text-xs font-headline font-bold uppercase tracking-wider shadow-md"
                >
                  Verify Mobile via OTP →
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Phone OTP Verification */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div className="bg-primary/5 p-3 rounded-xl border border-primary/20 text-xs text-primary space-y-0.5">
                <p className="font-bold flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" /> SMS OTP Sent to {formatPhoneNumber(phone)}
                </p>
                <p className="text-on-surface-variant text-[11px]">
                  Enter 4-digit code. <strong className="text-primary font-bold">(Demo OTP: 1234)</strong>
                </p>
              </div>

              {otpError && (
                <div className="text-xs text-error font-medium bg-error/10 p-2 rounded-lg">
                  {otpError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-headline font-bold text-on-surface-variant mb-1 text-center">
                  Enter 4-Digit OTP Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  placeholder="1234"
                  value={otpInput}
                  onChange={e => setOtpInput(e.target.value)}
                  className="form-input text-2xl font-mono font-bold tracking-widest text-center py-2 max-w-[180px] mx-auto block"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="btn-cta flex-2 text-xs py-2.5 font-headline font-bold uppercase tracking-wider shadow-md"
                >
                  Verify & Proceed
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Razorpay Payment Simulation */}
          {step === 'payment' && (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-2 sm:p-2.5 rounded-xl text-xs flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Phone Verified ({formatPhoneNumber(phone)})
                </span>
                <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-mono font-bold text-[9.5px]">VERIFIED</span>
              </div>

              {paymentError && (
                <div className="bg-error/10 border border-error/30 text-error p-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-headline font-bold text-xs text-primary">Select Razorpay Payment Gateway Method:</h4>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={isProcessingPayment}
                    onClick={() => handleExecutePayment('upi')}
                    className="p-2.5 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 transition text-left space-y-0.5 shadow-xs cursor-pointer"
                  >
                    <div className="flex items-center justify-between font-headline font-bold text-xs text-primary">
                      <span className="flex items-center gap-1"><Smartphone className="w-3.5 h-3.5 text-primary" /> Instant UPI</span>
                    </div>
                    <span className="inline-block text-[9px] bg-secondary-container text-on-secondary-container px-1.5 py-0.2 rounded font-bold">FASTEST</span>
                    <p className="text-[10px] text-on-surface-variant font-medium">GPay, PhonePe, Paytm</p>
                  </button>

                  <button
                    disabled={isProcessingPayment}
                    onClick={() => handleExecutePayment('card')}
                    className="p-2.5 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary/5 transition text-left space-y-0.5 shadow-xs cursor-pointer"
                  >
                    <div className="flex items-center justify-between font-headline font-bold text-xs text-primary">
                      <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5 text-primary" /> Card</span>
                    </div>
                    <span className="inline-block text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">ALL CARDS</span>
                    <p className="text-[10px] text-on-surface-variant font-medium">Visa, Mastercard, RuPay</p>
                  </button>
                </div>

                {/* Simulation controls for decline/failure */}
                <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between text-[10px] text-on-surface-variant">
                  <span className="font-bold text-on-surface flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-primary" /> Sandbox Simulator:
                  </span>
                  <button
                    disabled={isProcessingPayment}
                    onClick={() => handleExecutePayment('upi', true)}
                    className="text-error hover:text-error/80 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <AlertCircle className="w-3 h-3 text-error" /> Simulate Failure
                  </button>
                </div>
              </div>

              {isProcessingPayment && (
                <div className="py-3 text-center space-y-1 bg-surface-container-low rounded-xl border border-outline-variant/30">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="font-headline font-bold text-xs text-primary">Connecting to Razorpay Secure Gateway...</p>
                  <p className="text-[10px] text-on-surface-variant">Processing webhook payload and transaction log</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 5-Minute Hold Expired In-App Popup Modal */}
      {isHoldExpired && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/75 backdrop-blur-md p-3 sm:p-4">
          <div className="bg-white border border-outline-variant/60 rounded-2xl w-full max-w-sm p-4 space-y-3 shadow-2xl text-center animate-modalScaleIn text-on-surface overflow-hidden">
            <div className="w-10 h-10 bg-amber-50 border border-amber-300 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <Clock className="w-5 h-5 text-amber-600 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h3 className="font-headline font-extrabold text-base text-on-surface">
                Reservation Hold Expired
              </h3>
              <p className="text-[11px] text-on-surface-variant leading-tight">
                Your <strong>5-minute hold</strong> timed out. These slots have been released for other players.
              </p>
            </div>

            <div className="bg-surface-container-low p-2.5 rounded-xl text-xs space-y-1 border border-outline-variant/30 text-left font-medium">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Arena:</span>
                <strong className="text-on-surface font-bold truncate max-w-[180px]">{court.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Date:</span>
                <strong className="text-on-surface font-bold">{formatDateDDMMYYYY(dateStr)}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Slots:</span>
                <div className="text-primary font-bold flex items-center gap-1">
                  {sortedSlots.map((b, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1">
                      {idx > 0 && <span>, </span>}
                      <TimeOfDayIcon time24={b.start_time} className="w-3.5 h-3.5" />
                      <span>{formatTimeRange12hPlain(b.start_time, b.end_time)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary w-full py-2.5 text-xs font-headline font-bold flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh & View Available Slots
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
