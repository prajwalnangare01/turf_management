import React, { useState } from 'react';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { RedisLockService } from '../../services/redisLockService';
import { NotificationService } from '../../services/notificationService';
import { AuditLogger } from '../../services/auditLogger';
import { AdminUser, Court, Booking } from '../../types/schema';
import { CloudRain, AlertTriangle, ShieldCheck, CheckCircle2, Users, X, Send, Sun, Moon, AlertCircle } from 'lucide-react';
import { formatTime12hPlain, formatDateDDMMYYYY } from '../../utils/formatters';

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
  
  // Custom styled confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Sync date and reset states when modal opens
  React.useEffect(() => {
    if (isOpen) {
      if (initialDate) setDateStr(initialDate);
      setExecutionResult(null);
      setShowConfirmModal(false);
      setFeedbackError(null);
    }
  }, [isOpen, initialDate]);

  if (!isOpen) return null;

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

  // Triggered when clicking "1-Click Mass Cancel" button
  const handleOpenConfirm = () => {
    setFeedbackError(null);

    if (!canExecute) {
      setFeedbackError('Permission Denied: Staff role cannot issue emergency mass cancellations.');
      return;
    }

    if (affectedBookings.length === 0) {
      setFeedbackError('No active bookings match the selected date and time criteria.');
      return;
    }

    // Open styled confirmation alert dialog (proper format)
    setShowConfirmModal(true);
  };

  // Triggered when confirmed inside styled modal
  const handleExecuteEmergencyCancel = () => {
    if (!canExecute || affectedBookings.length === 0) return;

    setIsExecuting(true);
    setShowConfirmModal(false);

    let cancelledCount = 0;
    let refundedSum = 0;

    for (const booking of affectedBookings) {
      const refundReasonText = `Cancelled by venue owner due to rain and unplayable pitch conditions (100% full refund initiated). [Emergency Rainout] ${reason}`;
      const res = PostgresEngine.updateBookingStatus(booking.id, 'refunded', {
        refundAmount: booking.total_amount,
        refundReason: refundReasonText,
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

        // Dispatch customer notification (WhatsApp / Email / SMS)
        NotificationService.enqueueNotification(booking, 'cancellation');
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
  };

  const handleFinish = () => {
    if (executionResult && onSuccess) {
      onSuccess(executionResult.affectedCount, executionResult.totalRefund);
    }
    onClose();
  };

  const selectedCourtName = selectedCourtId === 'all' 
    ? 'All Courts (Entire Venue)' 
    : courts.find(c => c.id === selectedCourtId)?.name || 'Court';

  return (
    <>
      <div className="modal-overlay z-[9999]">
        <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-3xl lg:max-w-4xl max-h-[92vh] flex flex-col shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden">
          {/* Header */}
          <div className="p-3.5 sm:p-4 bg-red-50 border-b border-red-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shadow-xs">
                <CloudRain className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-headline font-bold text-base sm:text-lg text-red-950 leading-tight">
                    Emergency Rainout Mass Tool
                  </h3>
                  <span className="text-[10px] font-bold text-red-700 bg-red-100/80 px-2 py-0.5 rounded-full border border-red-200 hidden sm:inline-block">
                    CC-D02
                  </span>
                </div>
                <p className="text-[11px] text-red-700 font-medium">
                  Automated 100% full refunds & mass notification dispatch to all captains
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full text-red-700 hover:bg-red-200/50 transition cursor-pointer">
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
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                Successfully cancelled <strong>{executionResult.affectedCount} bookings</strong> and credited ₹<strong>{executionResult.totalRefund.toLocaleString('en-IN')}</strong> in 100% full refunds. Automated WhatsApp/SMS alerts dispatched to all captains.
              </p>
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 text-sky-950 text-xs text-left space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-sky-900">
                  <CloudRain className="w-4 h-4 text-sky-700" />
                  <span>Customer Notice Active:</span>
                </div>
                <p className="text-[11px] text-sky-850">
                  All affected slots have been moved to the <strong>Cancelled</strong> section with clear notification that cancellation was initiated by the turf owner due to rain.
                </p>
              </div>

              <button
                onClick={handleFinish}
                className="btn-primary w-full py-2.5 text-xs font-bold cursor-pointer"
              >
                Done & Return to Schedule
              </button>
            </div>
          ) : (
            <div className="p-3.5 sm:p-4 text-xs overflow-y-auto overscroll-contain flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Feedback Error Notice if any */}
                {feedbackError && (
                  <div className="p-2.5 bg-red-100 border border-red-300 rounded-xl text-red-800 flex items-center justify-between gap-2 font-bold text-xs animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{feedbackError}</span>
                    </div>
                    <button onClick={() => setFeedbackError(null)} className="p-1 hover:bg-red-200 rounded-lg cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* RBAC Warning if Staff */}
                {!canExecute && (
                  <div className="p-2.5 bg-red-100 border border-red-300 rounded-xl text-red-800 flex items-center gap-2 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>Permission Denied: Staff accounts cannot trigger emergency rainout mass cancellations.</span>
                  </div>
                )}

                {/* 2-Column Responsive Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch">
                  {/* Left Column: Scope & Schedule Parameters (7 cols) */}
                  <div className="md:col-span-7 bg-surface-container-low/50 rounded-2xl p-3 border border-outline-variant/30 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5 border-b border-outline-variant/20 pb-1.5">
                        <span>Cancellation Scope & Schedule</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-bold text-on-surface-variant">Target Date *</label>
                            <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded border border-primary/20">
                              {formatDateDDMMYYYY(dateStr)}
                            </span>
                          </div>
                          <input
                            type="date"
                            value={dateStr}
                            onChange={e => setDateStr(e.target.value)}
                            className="form-input text-xs font-bold py-1.5"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-on-surface-variant mb-1">Court Arena *</label>
                          <select
                            value={selectedCourtId}
                            onChange={e => setSelectedCourtId(e.target.value)}
                            className="form-input text-xs font-bold py-1.5"
                          >
                            <option value="all">🌧️ All Courts (Entire Venue)</option>
                            {courts.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Time Window */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-on-surface-variant">Cancellation Window *</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setTimeWindowType('full_day')}
                            className={`flex-1 py-1 px-2 text-xs rounded-lg font-bold border transition cursor-pointer ${
                              timeWindowType === 'full_day'
                                ? 'bg-primary text-white border-primary shadow-xs'
                                : 'bg-white text-on-surface-variant border-outline-variant/50 hover:bg-surface-container'
                            }`}
                          >
                            Full Day (All Slots)
                          </button>
                          <button
                            type="button"
                            onClick={() => setTimeWindowType('custom')}
                            className={`flex-1 py-1 px-2 text-xs rounded-lg font-bold border transition cursor-pointer ${
                              timeWindowType === 'custom'
                                ? 'bg-primary text-white border-primary shadow-xs'
                                : 'bg-white text-on-surface-variant border-outline-variant/50 hover:bg-surface-container'
                            }`}
                          >
                            Specific Interval
                          </button>
                        </div>

                        {timeWindowType === 'custom' && (
                          <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in duration-150">
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
                        <label className="block text-[11px] font-bold text-on-surface-variant mb-1">Customer-Facing Notice Reason *</label>
                        <input
                          type="text"
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder="e.g. Unplayable pitch conditions due to continuous rain"
                          className="form-input text-xs font-medium py-1.5"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Impacted Reservations Preview & Obligation (5 cols) */}
                  <div className="md:col-span-5 bg-amber-50/70 border border-amber-300/80 rounded-2xl p-3 flex flex-col justify-between text-amber-950">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between font-headline font-bold text-xs text-amber-900 border-b border-amber-200/80 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-amber-700" /> Impacted Bookings
                        </span>
                        <span className="bg-amber-200 text-amber-950 font-black px-2 py-0.5 rounded text-[11px]">
                          {affectedBookings.length} Bookings
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs py-1 px-2 bg-amber-100/70 rounded-lg border border-amber-200/70">
                        <span className="font-semibold text-amber-900 text-[11px]">Total 100% Refund:</span>
                        <strong className="font-black text-sm text-amber-950 font-mono">₹{totalRefundAmount.toLocaleString('en-IN')}</strong>
                      </div>

                      {affectedBookings.length > 0 ? (
                        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                          {affectedBookings.map(b => {
                            const cust = store.getCustomers().find(c => c.id === b.customer_id);
                            const isNight = parseInt(b.start_time.split(':')[0], 10) >= 18 || parseInt(b.start_time.split(':')[0], 10) < 5;
                            return (
                              <div key={b.id} className="bg-white/95 p-2 rounded-xl text-[11px] flex justify-between items-center border border-amber-200/80 shadow-2xs">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-bold text-on-surface truncate">{cust?.name || 'Customer'}</span>
                                  <span className="text-on-surface-variant text-[10px] font-mono flex items-center gap-1 shrink-0">
                                    <span className={`p-0.5 rounded shrink-0 inline-flex items-center justify-center ${
                                      isNight ? 'bg-indigo-50 text-indigo-500' : 'bg-amber-50 text-amber-500'
                                    }`}>
                                      {isNight ? <Moon className="w-2.5 h-2.5" /> : <Sun className="w-2.5 h-2.5" />}
                                    </span>
                                    <span>{formatTime12hPlain(b.start_time)}–{formatTime12hPlain(b.end_time)}</span>
                                  </span>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <span className="font-bold text-primary font-mono">₹{b.total_amount}</span>
                                  <span className="block text-[8.5px] text-emerald-700 font-extrabold">100% Refund</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-7 text-center text-amber-800/80 text-[11px] bg-white/50 rounded-xl border border-dashed border-amber-200 flex flex-col items-center justify-center gap-1">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          <span className="font-semibold text-on-surface">No bookings impacted</span>
                          <span className="text-[10px] text-on-surface-variant">Selected date & time has no active reservations.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-outline-variant/30 flex gap-2.5 shrink-0 mt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary flex-1 py-2 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canExecute || affectedBookings.length === 0 || isExecuting}
                  onClick={handleOpenConfirm}
                  className="btn-cta flex-2 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <CloudRain className="w-4 h-4" />
                  {isExecuting ? 'Processing Mass Refunds...' : `1-Click Mass Cancel (${affectedBookings.length} Bookings)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PROPER FORMAT CONFIRMATION MODAL (Replaces browser confirm()) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-red-300 rounded-3xl sm:rounded-2xl w-full max-w-lg p-4 sm:p-5 shadow-2xl animate-modalScaleIn text-on-surface space-y-3.5">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200">
                <CloudRain className="w-6 h-6 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-headline font-extrabold uppercase tracking-wider text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                    Emergency Action
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                    100% Full Refunds
                  </span>
                </div>
                <h3 className="font-headline font-bold text-base text-red-950 mt-1 leading-tight">
                  Confirm Rainout Mass Cancellation
                </h3>
                <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                  Are you sure you want to mass-cancel all matching slots and issue 100% instant refunds?
                </p>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full cursor-pointer hover:bg-surface-container"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Structured Details Card */}
            <div className="bg-surface-container-low rounded-2xl p-3 border border-outline-variant/40 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20 col-span-1">
                <span className="text-on-surface-variant font-medium text-[11px]">Target Date:</span>
                <span className="font-headline font-extrabold text-on-surface font-mono">{formatDateDDMMYYYY(dateStr)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20 col-span-1">
                <span className="text-on-surface-variant font-medium text-[11px]">Pitch / Court:</span>
                <span className="font-bold text-on-surface truncate ml-1">{selectedCourtName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20 col-span-1">
                <span className="text-on-surface-variant font-medium text-[11px]">Time Window:</span>
                <span className="font-bold text-on-surface text-[11px]">
                  {timeWindowType === 'full_day' ? 'Full Day (All Slots)' : `${formatTime12hPlain(startTime)} – ${formatTime12hPlain(endTime)}`}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20 col-span-1">
                <span className="text-on-surface-variant font-medium text-[11px]">Impacted:</span>
                <span className="font-headline font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                  {affectedBookings.length} {affectedBookings.length === 1 ? 'Booking' : 'Bookings'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 col-span-2 pt-1 border-t border-outline-variant/30">
                <span className="text-on-surface-variant font-bold text-[11px]">Total 100% Refund Obligation:</span>
                <span className="font-headline font-black text-sm text-emerald-700 font-mono">₹{totalRefundAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Notice info banner */}
            <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>What happens next:</span>
              </div>
              <ul className="list-disc list-inside text-[10.5px] space-y-0.5 pl-1 text-amber-850">
                <li>All {affectedBookings.length} slots are immediately moved to the <strong>Cancelled</strong> section.</li>
                <li>Customers will see: <em>"Cancelled by Venue Owner due to Rain (100% Refunded)"</em>.</li>
                <li>Automated cancellation notices & refund confirmations will be dispatched.</li>
              </ul>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/30">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="btn-secondary py-2 text-xs font-bold cursor-pointer"
                disabled={isExecuting}
              >
                Keep Active Bookings
              </button>
              <button
                type="button"
                onClick={handleExecuteEmergencyCancel}
                disabled={isExecuting}
                className="btn-cta py-2 text-xs font-headline font-bold bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <CloudRain className="w-4 h-4" />
                {isExecuting ? 'Cancelling & Refunding...' : 'Yes, Execute Mass Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
