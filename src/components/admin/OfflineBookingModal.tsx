import React, { useState } from 'react';
import { store } from '../../services/store';
import { RedisLockService } from '../../services/redisLockService';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { Court, AdminUser, BookingSource, PaymentMethod } from '../../types/schema';
import { AlertTriangle, ShieldAlert, PlusCircle, X } from 'lucide-react';

interface OfflineBookingModalProps {
  initialCourtId?: string;
  initialDate?: string;
  initialStartTime?: string;
  currentAdmin: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
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
  const [startTime, setStartTime] = useState(initialStartTime || '18:00');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<BookingSource>('offline_walkin');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');

  // Lock check
  const conflictInfo = RedisLockService.checkAdminConflict(courtId, dateStr, startTime);
  const [overrideLock, setOverrideLock] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const selectedCourt = courts.find(c => c.id === courtId);
  const courtSportId = selectedCourt?.sport_ids[0] || sports[0]?.id || '';
  const price = selectedCourt ? selectedCourt.base_price_per_hour : 1000;

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
    const [h, m] = startTime.split(':').map(Number);
    const endH = (h + 1).toString().padStart(2, '0');
    const endTime = `${endH}:${m.toString().padStart(2, '0')}`;
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

    onSuccess();
  };

  return (
    <div className="modal-backdrop">
      <div className="bg-[#131b2e] border border-[#24304f] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 bg-[#0b0f19] border-b border-[#24304f] flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400">
            <PlusCircle className="w-5 h-5" />
            <h3 className="font-semibold text-lg text-white">Create Offline Booking</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Real-Time Redis Customer Lock Conflict Warning */}
          {conflictInfo.hasLock && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Active Customer Checkout Lock Detected</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                A customer is currently checking out this slot online (lock expires in <strong>{conflictInfo.remainingSeconds}s</strong>).
              </p>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-white cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={overrideLock}
                  onChange={e => setOverrideLock(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                Override online lock & force offline booking
              </label>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Select Court *</label>
            <select
              value={courtId}
              onChange={e => setCourtId(e.target.value)}
              className="input-field"
            >
              {courts.map(c => (
                <option key={c.id} value={c.id}>{c.name} (₹{c.base_price_per_hour}/hr)</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Date *</label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Start Time *</label>
              <input
                type="text"
                required
                placeholder="18:00"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Customer Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Vikram"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Mobile Phone *</label>
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Booking Source</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as BookingSource)}
                className="input-field"
              >
                <option value="offline_walkin">Walk-in Counter</option>
                <option value="offline_phone">Phone Call</option>
                <option value="offline_whatsapp">WhatsApp Direct</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                className="input-field"
              >
                <option value="cash">Cash Counter</option>
                <option value="upi">Direct UPI Scan</option>
                <option value="card">POS Card Machine</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Notes / Special Instructions</label>
            <input
              type="text"
              placeholder="e.g. Paid cash at counter, requested extra bibs"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input-field"
            />
          </div>

          <button type="submit" className="btn btn-primary w-full text-xs font-bold py-2.5 mt-2">
            Confirm & Save Booking (₹{price})
          </button>
        </form>
      </div>
    </div>
  );
};
