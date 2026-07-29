import React, { useState } from 'react';
import { store } from '../../services/store';
import { RedisLockService } from '../../services/redisLockService';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { SlotEngine } from '../../services/slotEngine';
import { AdminUser, BookingSource, PaymentMethod } from '../../types/schema';
import { AlertTriangle, ShieldAlert, PlusCircle, X } from 'lucide-react';

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
  const availableSlots = selectedCourt ? SlotEngine.computeSlotsForCourt(selectedCourt, dateStr) : [];
  
  const [startTime, setStartTime] = useState(() => {
    if (initialStartTime) return initialStartTime;
    return availableSlots[0]?.start_time || '06:00';
  });

  const selectedSlot = availableSlots.find(s => s.start_time === startTime) || availableSlots[0];
  const price = selectedSlot ? selectedSlot.price : (selectedCourt?.base_price_per_hour || 1000);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<BookingSource>('offline_walkin');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');

  // Lock check
  const conflictInfo = RedisLockService.checkAdminConflict(courtId, dateStr, startTime);
  const [overrideLock, setOverrideLock] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const courtSportId = selectedCourt?.sport_ids[0] || sports[0]?.id || '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim() || phone.length < 10) {
      setErrorMsg('Please enter customer full name and valid 10-digit phone number');
      return;
    }

    if (conflictInfo.hasLock && !overrideLock) {
      setErrorMsg('An active online checkout lock exists on this slot. Check the override box if you wish to proceed.');
      return;
    }

    // 1. Get or Create Customer
    const customers = store.getCustomers();
    let customer = customers.find(c => c.phone === phone);
    if (!customer) {
      customer = {
        id: `cust-${Date.now()}`,
        name,
        phone,
        created_at: new Date().toISOString(),
        total_bookings: 1,
        total_spent: price,
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
      notes
    });

    if (!result.success) {
      setErrorMsg(result.message);
      return;
    }

    // Release Redis lock if overwritten
    RedisLockService.releaseLock(courtId, dateStr, startTime);

    // Audit Log
    AuditLogger.log(
      currentAdmin.id,
      'CREATE_OFFLINE_BOOKING',
      'Booking',
      result.booking!.id,
      null,
      result.booking
    );

    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl animate-modalScaleIn text-on-surface">
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
          {/* Real-Time Redis Lock Warning */}
          {conflictInfo.hasLock && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-headline font-bold text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                <span>Customer Online Hold Lock Detected</span>
              </div>
              <p className="text-[11px] leading-relaxed font-medium">
                A customer is currently checking out this slot online (hold expires in <strong>{conflictInfo.remainingSeconds}s</strong>).
              </p>
              <label className="flex items-center gap-2 text-[11px] font-bold text-amber-950 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={overrideLock}
                  onChange={e => setOverrideLock(e.target.checked)}
                  className="rounded accent-secondary"
                />
                Override online hold lock & force walk-in reservation
              </label>
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
                  const slots = SlotEngine.computeSlotsForCourt(c, dateStr);
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
              <label className="block text-xs font-headline font-bold text-on-surface-variant mb-1">Date *</label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={e => {
                  setDateStr(e.target.value);
                  if (selectedCourt) {
                    const slots = SlotEngine.computeSlotsForCourt(selectedCourt, e.target.value);
                    if (slots.length > 0) setStartTime(slots[0].start_time);
                  }
                }}
                className="form-input"
              />
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
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                className="form-input"
              >
                <option value="cash">Cash Counter</option>
                <option value="upi">Direct UPI Scan</option>
                <option value="card">POS Card Machine</option>
              </select>
            </div>
          </div>

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
