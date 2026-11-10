import React, { useState } from 'react';
import { store } from '../../services/store';
import { RedisLockService } from '../../services/redisLockService';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { NotificationService } from '../../services/notificationService';
import { SlotEngine } from '../../services/slotEngine';
import { AdminUser, BookingSource, PaymentMethod, Payment } from '../../types/schema';
import { normalizeIndianPhone, getVenueDateString } from '../../utils/venueTime';
import { AlertTriangle, ShieldAlert, PlusCircle, X, Split, KeyRound, Clock } from 'lucide-react';

interface OfflineBookingModalProps {
  initialCourtId?: string;
  initialDate?: string;
  initialStartTime?: string;
  currentAdmin: AdminUser;
  onClose: () => void;
  onSuccess?: () => void;
}

export const OfflineBookingModal: React.FC<OfflineBookingModalProps> = ({
  initialCourtId,
  initialDate,
  initialStartTime,
  currentAdmin,
  onClose,
  onSuccess
}) => {
  const courts = store.getCourts();
  const sports = store.getSports();
  const todayStr = new Date().toISOString().split('T')[0];

  const [courtId, setCourtId] = useState(initialCourtId || courts[0]?.id || '');
  const [dateStr, setDateStr] = useState(initialDate || todayStr);

  const selectedCourt = courts.find(c => c.id === courtId);

  // Compute available slots for court and date
  const availableSlots = selectedCourt ? SlotEngine.computeSlotsForCourt(selectedCourt, dateStr, undefined, true) : [];
  
  const [startTime, setStartTime] = useState(() => {
    if (initialStartTime) return initialStartTime;
    return availableSlots[0]?.start_time || '06:00';
  });

  const selectedSlot = availableSlots.find(s => s.start_time === startTime) || availableSlots[0];
  const price = selectedSlot ? selectedSlot.price : (selectedCourt?.base_price_per_hour || 1000);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<BookingSource>('offline_walkin');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | 'split'>('cash');
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitUpi, setSplitUpi] = useState<number>(0);
  const [splitUpiRef, setSplitUpiRef] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Lock check
  const conflictInfo = RedisLockService.checkAdminConflict(courtId, dateStr, startTime);
  const [overrideLock, setOverrideLock] = useState(false);
  const [overrideReason, setOverrideReason] = useState('Counter walk-in customer paying immediately; online hold expired or abandoned');
  const [errorMsg, setErrorMsg] = useState('');

  const courtSportId = selectedCourt?.sport_ids[0] || sports[0]?.id || '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanDigits = phone.replace(/\D/g, '');
    if (!name.trim() || cleanDigits.length < 10) {
      setErrorMsg('Please enter customer full name and valid 10-digit phone number');
      return;
    }

    const normalizedPhone = normalizeIndianPhone(phone);

    // CC-D04: Multi-Tender Split Payment Validation
    if (paymentMethod === 'split') {
      const splitSum = (Number(splitCash) || 0) + (Number(splitUpi) || 0);
      if (splitSum !== price) {
        setErrorMsg(`Split payment sum (₹${splitSum}) must equal the exact slot price (₹${price}). Difference: ₹${price - splitSum}`);
        return;
      }
    }

    // EDGE CASE: Prevent creating bookings in the past
    const now = new Date();
    const nowY = now.getFullYear();
    const nowM = String(now.getMonth() + 1).padStart(2, '0');
    const nowD = String(now.getDate()).padStart(2, '0');
    const localToday = `${nowY}-${nowM}-${nowD}`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [slotH, slotM] = startTime.split(':').map(Number);
    const slotMinutes = (slotH || 0) * 60 + (slotM || 0);

    if (dateStr < localToday || (dateStr === localToday && slotMinutes < currentMinutes)) {
      setErrorMsg('Cannot create offline walk-in bookings for past dates or elapsed time slots.');
      return;
    }

    // Admin Authority: Venue managers and staff are authorized to book on ANY future date (no advance limit)

    // CC-D01: Active Hold & RBAC Override Protection
    if (conflictInfo.hasLock && !overrideLock) {
      setErrorMsg('An active online checkout lock exists on this slot. Check the manager override box if you wish to proceed.');
      return;
    }

    if (conflictInfo.hasLock && overrideLock) {
      if (currentAdmin.role === 'staff') {
        setErrorMsg('Permission Denied: Staff cannot override active online checkout holds. Only Managers and Owners can perform hold overrides.');
        return;
      }
      if (!overrideReason.trim()) {
        setErrorMsg('Please specify an audit reason for overriding the active online hold.');
        return;
      }
    }

    // 1. Get or Create Customer with E.164 normalized phone
    const customers = store.getCustomers();
    let customer = customers.find(c => 
      normalizeIndianPhone(c.phone) === normalizedPhone || 
      c.phone.replace(/\D/g, '').slice(-10) === cleanDigits.slice(-10)
    );

    // EDGE CASE: Alert staff if customer is blacklisted
    if (customer && customer.is_blacklisted) {
      const proceed = confirm(`⚠️ Warning: Customer ${customer.name} (${customer.phone}) is currently BLACKLISTED (${customer.no_show_count} no-shows recorded).\n\nDo you want to override and allow this counter walk-in reservation?`);
      if (!proceed) return;
    }

    if (!customer) {
      customer = {
        id: `cust-${Date.now()}`,
        name,
        phone: normalizedPhone,
        created_at: new Date().toISOString(),
        total_bookings: 0,
        total_spent: 0,
        no_show_count: 0,
        is_blacklisted: false
      };
      customers.push(customer);
      store.setCustomers(customers);
    }

    // Calculate end time
    const slotDuration = selectedCourt ? selectedCourt.slot_duration_minutes : 60;
    const [h, m] = startTime.split(':').map(Number);
    const endTotalMins = h * 60 + m + slotDuration;
    const endH = Math.floor(endTotalMins / 60).toString().padStart(2, '0');
    const endM = (endTotalMins % 60).toString().padStart(2, '0');
    const endTime = `${endH}:${endM}`;
    const bookingRef = `TRF-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const effectiveNotes = paymentMethod === 'split'
      ? `[Split Tender: Cash ₹${splitCash} + UPI ₹${splitUpi}${splitUpiRef ? ` (UTR: ${splitUpiRef})` : ''}] ${notes}`.trim()
      : notes;

    // 2. Insert into DB via Postgres Engine (Unique constraint check)
    const result = PostgresEngine.createBooking({
      booking_ref: bookingRef,
      customer_id: customer.id,
      court_id: courtId,
      sport_id: courtSportId,
      booking_date: dateStr,
      start_time: startTime,
      end_time: endTime,
      source,
      status: 'confirmed',
      total_amount: price,
      discount_amount: 0,
      created_by_admin_id: currentAdmin.id,
      notes: effectiveNotes
    });

    if (!result.success) {
      setErrorMsg(result.message);
      return;
    }

    // Create payment ledger record
    const payments = store.getPayments();
    payments.push({
      id: `pay-${Date.now()}`,
      booking_id: result.booking!.id,
      gateway: paymentMethod === 'upi' ? 'razorpay' : 'cash',
      amount: price,
      status: 'captured',
      method: (paymentMethod === 'split' ? 'cash' : paymentMethod) as any,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    store.setPayments(payments);

    // Release Redis lock if overwritten
    if (conflictInfo.hasLock) {
      RedisLockService.releaseLock(courtId, dateStr, startTime);
      AuditLogger.log(
        currentAdmin.id,
        'MANAGER_OVERRIDE_ACTIVE_HOLD',
        'SlotLock',
        `${courtId}_${dateStr}_${startTime}`,
        { locked_by: conflictInfo.lock?.locked_by, remaining_seconds: conflictInfo.remainingSeconds },
        { override_reason: overrideReason, booking_ref: bookingRef }
      );
    }

    // Audit Log
    AuditLogger.log(
      currentAdmin.id,
      'CREATE_OFFLINE_BOOKING',
      'Booking',
      result.booking!.id,
      null,
      result.booking
    );

    // Dispatch confirmation email & gatepass via Resend if customer has email
    if (result.booking) {
      NotificationService.enqueueNotification(result.booking, 'confirmation');
    }

    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl animate-modalScaleIn text-on-surface">
        <div className="p-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-secondary font-bold" />
            <h3 className="font-headline font-bold text-xl text-primary">New Walk-in Booking</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Real-Time Redis Lock Warning (CC-D01) */}
          {conflictInfo.hasLock && (
            <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-900 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-headline font-bold text-xs text-amber-950">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 animate-pulse" />
                  <span>Slot Held in Online/WhatsApp Checkout</span>
                </div>
                <span className="font-mono font-black text-xs bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded">
                  {Math.floor(conflictInfo.remainingSeconds / 60)}:{(conflictInfo.remainingSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className="text-[11px] leading-relaxed font-medium bg-white/70 p-2.5 rounded-xl border border-amber-200/60 space-y-1">
                <p>
                  A customer is currently checking out this slot online. Hold expires in <strong>{conflictInfo.remainingSeconds}s</strong>.
                </p>
                {conflictInfo.lock?.locked_by && (
                  <p className="text-[10px] text-amber-800 font-mono">
                    Held by: <strong>{conflictInfo.lock.locked_by.length === 10 ? `+91 ${conflictInfo.lock.locked_by}` : conflictInfo.lock.locked_by}</strong>
                  </p>
                )}
              </div>

              {currentAdmin.role === 'staff' ? (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-bold">
                  ⚠️ Staff Restriction: Only Managers or Owners can override active customer checkout holds.
                </div>
              ) : (
                <div className="space-y-2 pt-1 border-t border-amber-200">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-amber-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideLock}
                      onChange={e => setOverrideLock(e.target.checked)}
                      className="rounded accent-amber-700 w-3.5 h-3.5"
                    />
                    Manager Override: Force-claim slot for counter walk-in
                  </label>

                  {overrideLock && (
                    <div>
                      <label className="block text-[10px] font-bold text-amber-900 mb-0.5">Override Audit Reason *</label>
                      <input
                        type="text"
                        required
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder="e.g. Counter walk-in paying cash immediately"
                        className="form-input text-xs py-1 px-2 border-amber-300 bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Select Pitch / Arena *</label>
            <select
              value={courtId}
              onChange={e => {
                setCourtId(e.target.value);
                const c = courts.find(crt => crt.id === e.target.value);
                if (c) {
                  const slots = SlotEngine.computeSlotsForCourt(c, dateStr, undefined, true);
                  if (slots.length > 0) setStartTime(slots[0].start_time);
                }
              }}
              className="form-input"
            >
              {courts.map(c => (
                <option key={c.id} value={c.id}>{c.name} (₹{c.base_price_per_hour}/hr)</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-headline font-bold text-on-surface-variant">Date *</label>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                  ✨ Admin Authority: Any Date
                </span>
              </div>
              <input
                type="date"
                required
                min={getVenueDateString(0)}
                value={dateStr}
                onChange={e => {
                  setDateStr(e.target.value);
                  if (selectedCourt) {
                    const slots = SlotEngine.computeSlotsForCourt(selectedCourt, e.target.value, undefined, true);
                    if (slots.length > 0) setStartTime(slots[0].start_time);
                  }
                }}
                className="form-input"
              />
              {/* Quick Jump Buttons for Future Dates */}
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {[
                  { label: 'Today', days: 0 },
                  { label: 'Tomorrow', days: 1 },
                  { label: '+15 Days', days: 15 },
                  { label: '+30 Days (Next Mo.)', days: 30 },
                  { label: '+60 Days', days: 60 }
                ].map(item => {
                  const targetD = getVenueDateString(item.days);
                  const isCurrent = dateStr === targetD;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setDateStr(targetD);
                        if (selectedCourt) {
                          const slots = SlotEngine.computeSlotsForCourt(selectedCourt, targetD, undefined, true);
                          if (slots.length > 0) setStartTime(slots[0].start_time);
                        }
                      }}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
                        isCurrent
                          ? 'bg-primary text-white shadow-xs'
                          : 'bg-surface-container hover:bg-primary/10 text-on-surface-variant border border-outline-variant/40'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Select Time Slot *</label>
              <select
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="form-input font-bold"
              >
                {availableSlots.map(s => {
                  const statusLabel = s.status === 'available' ? 'Available' : s.status.toUpperCase();
                  return (
                    <option key={s.start_time} value={s.start_time}>
                      {s.start_time} - {s.end_time} ({statusLabel} - ₹{s.price})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Customer Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Vikram"
                value={name}
                onChange={e => setName(e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Mobile Phone *</label>
              <input
                type="tel"
                required
                maxLength={10}
                placeholder="9876543210"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                className="form-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Booking Source</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as BookingSource)}
                className="form-input"
              >
                <option value="offline_walkin">Walk-in Counter</option>
                <option value="offline_phone">Phone Call</option>
                <option value="offline_whatsapp">WhatsApp Direct</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => {
                  const val = e.target.value as any;
                  setPaymentMethod(val);
                  if (val === 'split') {
                    setSplitCash(Math.floor(price / 2));
                    setSplitUpi(price - Math.floor(price / 2));
                  }
                }}
                className="form-input font-bold"
              >
                <option value="cash">💵 Cash Counter</option>
                <option value="upi">📱 Direct UPI Scan</option>
                <option value="card">💳 POS Card Machine</option>
                <option value="split">⚖️ Split Tender (Cash + UPI)</option>
              </select>
            </div>
          </div>

          {/* CC-D04: Multi-Tender Split Payment Inputs */}
          {paymentMethod === 'split' && (
            <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-purple-900">
                <span className="font-headline font-bold text-xs flex items-center gap-1.5">
                  <Split className="w-3.5 h-3.5 text-purple-700" /> Split Tender Breakdown
                </span>
                <span className="text-[10px] font-mono font-bold bg-purple-200/60 px-2 py-0.5 rounded">
                  Target Total: ₹{price}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-purple-900 mb-1">Cash Tender (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    max={price}
                    value={splitCash}
                    onChange={e => {
                      const val = Number(e.target.value) || 0;
                      setSplitCash(val);
                      setSplitUpi(Math.max(0, price - val));
                    }}
                    className="form-input text-xs py-1.5 px-2.5 bg-white border-purple-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-purple-900 mb-1">UPI Tender (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    max={price}
                    value={splitUpi}
                    onChange={e => {
                      const val = Number(e.target.value) || 0;
                      setSplitUpi(val);
                      setSplitCash(Math.max(0, price - val));
                    }}
                    className="form-input text-xs py-1.5 px-2.5 bg-white border-purple-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-purple-900 mb-0.5">UPI Reference / UTR (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref / GooglePay txn id"
                  value={splitUpiRef}
                  onChange={e => setSplitUpiRef(e.target.value)}
                  className="form-input text-xs py-1 px-2.5 bg-white border-purple-300"
                />
              </div>

              <div className="flex justify-between items-center text-[10px] font-bold pt-1 border-t border-purple-200">
                <span className="text-purple-800">Split Total Recorded:</span>
                <span className={((Number(splitCash) || 0) + (Number(splitUpi) || 0)) === price ? 'text-emerald-700 font-black' : 'text-red-600 font-black'}>
                  ₹{(Number(splitCash) || 0) + (Number(splitUpi) || 0)} / ₹{price}
                  {((Number(splitCash) || 0) + (Number(splitUpi) || 0)) === price ? ' (Balanced ✅)' : ' (Unbalanced ⚠️)'}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Notes / Instructions</label>
            <input
              type="text"
              placeholder="e.g. Paid cash at counter, requested extra bibs"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="form-input"
            />
          </div>

          <button type="submit" className="btn-cta w-full py-3 text-xs font-headline font-bold uppercase tracking-wider shadow-md mt-2">
            Confirm & Save Reservation (₹{price})
          </button>
        </form>
      </div>
    </div>
  );
};
