import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { RedisLockService } from '../../services/redisLockService';
import { NotificationService } from '../../services/notificationService';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, Court, Booking } from '../../types/schema';
import { CloudRain, AlertTriangle, ShieldCheck, CheckCircle2, Users, X, Send } from 'lucide-react';
import { formatTimeRange12h } from '../../utils/formatters';

interface EmergencyWeatherModalProps {
  isOpen: boolean;
  currentAdmin: AdminUser;
  initialDate?: string;
  onClose: () => void;
  onSuccess?: (affectedCount: number, refundTotal: number) => void;
}

export const EmergencyWeatherModal: React.FC<EmergencyWeatherModalProps> = ({
  isOpen,
  currentAdmin,
  initialDate,
  onClose,
  onSuccess
}) => {
  if (!isOpen) return null;

  const courts = store.getCourts();
  const todayStr = new Date().toISOString().split('T')[0];

  const [dateStr, setDateStr] = useState(initialDate || todayStr);
  const [selectedCourtId, setSelectedCourtId] = useState<string>('all');
  const [timeWindowType, setTimeWindowType] = useState<'full_day' | 'custom'>('full_day');
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('23:00');
  const [reason, setReason] = useState('Unplayable pitch conditions due to continuous torrential rain and waterlogging.');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ affectedCount: number; totalRefund: number } | null>(null);

  // RBAC check: only manager and owner can issue mass emergency rainout cancellations
  const canExecute = currentAdmin.role === 'owner' || currentAdmin.role === 'manager';

  // Compute affected bookings
  const allBookings = store.getBookings();
  const affectedBookings = allBookings.filter(b => {
    if (b.booking_date !== dateStr) return false;
    if (b.status !== 'confirmed' && b.status !== 'pending_payment') return false;
    if (selectedCourtId !== 'all' && b.court_id !== selectedCourtId) return false;

    if (timeWindowType === 'full_day') return true;

    // Check time interval overlap
    return PostgresEngine.isTimeOverlap(b.start_time, b.end_time, startTime, endTime);
  });

  const totalRefundAmount = affectedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);

  const handleExecuteEmergencyCancel = () => {
    if (!canExecute) {
      alert('Permission Denied: Staff role cannot issue emergency mass cancellations.');
      return;
    }

    if (affectedBookings.length === 0) {
      alert('No active bookings match the selected date and time criteria.');
      return;
    }

    const confirmed = confirm(
      `⚠️ CONFIRM EMERGENCY RAINOUT MASS CANCELLATION:\n\n` +
      `Date: ${dateStr}\n` +
      `Court: ${selectedCourtId === 'all' ? 'All Courts' : courts.find(c => c.id === selectedCourtId)?.name}\n` +
      `Affected Bookings: ${affectedBookings.length}\n` +
      `Total 100% Refund: ₹${totalRefundAmount}\n\n` +
      `Are you sure you want to cancel all matching bookings and issue 100% instant refunds with automated notifications?`
    );

    if (!confirmed) return;

    setIsExecuting(true);

    let cancelledCount = 0;
    let refundedSum = 0;

    for (const booking of affectedBookings) {
      const res = PostgresEngine.updateBookingStatus(booking.id, 'refunded', {
        refundAmount: booking.total_amount,
        refundReason: `[Emergency Rainout] ${reason}`,
        cancelledBy: 'admin',
        adminId: currentAdmin.id,
        metTerms: true,
        noticeHours: 0
      });

      if (res.success) {
        cancelledCount++;
        refundedSum += booking.total_amount;
        // Release Redis lock
        RedisLockService.releaseLocksForBooking(booking.court_id, booking.booking_date, booking.start_time, booking.end_time);
      }
    }

    // Audit Log
    AuditLogger.log(
      currentAdmin.id,
      'EMERGENCY_WEATHER_RAINOUT_MASS_CANCEL',
      'Venue',
      store.getVenue().id,
      null,
      {
        date: dateStr,
        court_id: selectedCourtId,
        cancelled_count: cancelledCount,
        refunded_sum: refundedSum,
        reason
      }
    );

    setIsExecuting(false);
    setExecutionResult({ affectedCount: cancelledCount, totalRefund: refundedSum });

    if (onSuccess) {
      onSuccess(cancelledCount, refundedSum);
    }
  };

  return (
    <div className="modal-overlay z-[9999]">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-modalScaleIn text-on-surface">
        {/* Header */}
        <div className="p-4 bg-red-50 border-b border-red-200 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shadow-xs">
              <CloudRain className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h3 className="font-headline font-bold text-lg text-red-950 leading-tight">
                Emergency Rainout Mass Tool
              </h3>
              <p className="text-[11px] text-red-700 font-medium">
                CC-D02: Automated 100% refunds & mass captain dispatch
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-red-700 hover:bg-red-200/50 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success State Screen */}
        {executionResult ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl">
              ✅
            </div>
            <h3 className="font-headline font-bold text-xl text-primary">Emergency Rainout Executed</h3>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              Successfully cancelled <strong>{executionResult.affectedCount} bookings</strong> and credited ₹<strong>{executionResult.totalRefund.toLocaleString('en-IN')}</strong> in 100% full refunds. Automated WhatsApp/SMS alerts dispatched to all captains.
            </p>

            <button
              onClick={onClose}
              className="btn-primary w-full py-2.5 text-xs font-bold"
            >
              Done & Return to Schedule
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4 text-xs">
            {/* RBAC Warning if Staff */}
            {!canExecute && (
              <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-red-800 flex items-center gap-2 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>Permission Denied: Staff accounts cannot trigger emergency rainout mass cancellations.</span>
              </div>
            )}

            {/* Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Target Date *</label>
                <input
                  type="date"
                  value={dateStr}
                  onChange={e => setDateStr(e.target.value)}
                  className="form-input text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Court Arena *</label>
                <select
                  value={selectedCourtId}
                  onChange={e => setSelectedCourtId(e.target.value)}
                  className="form-input text-xs font-bold"
                >
                  <option value="all">🌧️ All Courts (Entire Venue)</option>
                  {courts.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Time Window */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-on-surface-variant">Cancellation Time Window *</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTimeWindowType('full_day')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                    timeWindowType === 'full_day'
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40'
                  }`}
                >
                  Full Day (All Slots)
                </button>
                <button
                  type="button"
                  onClick={() => setTimeWindowType('custom')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                    timeWindowType === 'custom'
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40'
                  }`}
                >
                  Specific Interval
                </button>
              </div>

              {timeWindowType === 'custom' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant block mb-0.5">Start Time</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="form-input text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant block mb-0.5">End Time</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      className="form-input text-xs py-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Cancellation Reason */}
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Customer-Facing Cancellation Reason *</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Unplayable pitch conditions due to continuous rain"
                className="form-input text-xs font-medium"
              />
            </div>

            {/* Impact Live Summary Box */}
            <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-3.5 space-y-2 text-amber-950">
              <div className="flex items-center justify-between font-headline font-bold text-xs text-amber-900">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-700" /> Impacted Reservations Preview
                </span>
                <span className="bg-amber-200 text-amber-950 font-black px-2 py-0.5 rounded text-[11px]">
                  {affectedBookings.length} Bookings
                </span>
              </div>

              <div className="flex justify-between items-center text-xs pt-1 border-t border-amber-200/80">
                <span>Total 100% Refund Obligation:</span>
                <strong className="font-black text-sm text-amber-950">₹{totalRefundAmount.toLocaleString('en-IN')}</strong>
              </div>

              {affectedBookings.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1.5 pt-1.5 border-t border-amber-200/60">
                  {affectedBookings.map(b => {
                    const cust = store.getCustomers().find(c => c.id === b.customer_id);
                    return (
                      <div key={b.id} className="bg-white/80 p-2 rounded-lg text-[11px] flex justify-between items-center border border-amber-200/60">
                        <div>
                          <span className="font-bold text-on-surface">{cust?.name || 'Customer'}</span>
                          <span className="text-on-surface-variant text-[10px] ml-1.5 font-mono">{b.start_time} - {b.end_time}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-primary">₹{b.total_amount}</span>
                          <span className="block text-[9px] text-emerald-700 font-bold">100% Refund Due</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary flex-1 py-2.5 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canExecute || affectedBookings.length === 0 || isExecuting}
                onClick={handleExecuteEmergencyCancel}
                className="btn-cta flex-1 py-2.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <CloudRain className="w-4 h-4" />
                {isExecuting ? 'Processing Mass Refunds...' : `1-Click Mass Cancel (${affectedBookings.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
