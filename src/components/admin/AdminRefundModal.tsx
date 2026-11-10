import React, { useState, useEffect } from 'react';
import { Booking, AdminUser } from '../../types/schema';
import { store } from '../../services/store';
import { PostgresEngine } from '../../services/postgresEngine';
import { AuditLogger } from '../../services/auditLogger';
import { formatTimeRange12h, formatTimeRange12hPlain, formatDateDDMMYYYY, formatPhoneNumber } from '../../utils/formatters';
import { 
  X, 
  RotateCcw, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  FileText,
  User,
  Calendar,
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';

interface AdminRefundModalProps {
  booking: Booking | null;
  isOpen: boolean;
  currentAdmin: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminRefundModal: React.FC<AdminRefundModalProps> = ({
  booking,
  isOpen,
  currentAdmin,
  onClose,
  onSuccess
}) => {
  // Form State - always called unconditionally
  const [refundMode, setRefundMode] = useState<'policy' | 'full' | 'custom' | 'none'>('policy');
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customers = store.getCustomers();
  const courts = store.getCourts();
  const customer = booking ? customers.find(c => c.id === booking.customer_id) : undefined;
  const court = booking ? courts.find(c => c.id === booking.court_id) : undefined;
  const totalAmount = booking?.total_amount || 0;

  // Calculate time window until match start
  const bookingStart = booking ? new Date(`${booking.booking_date}T${booking.start_time}:00`) : new Date();
  const hoursUntilStart = booking ? (bookingStart.getTime() - Date.now()) / (1000 * 60 * 60) : 0;

  // Retrieve admin cancellation terms & conditions
  const cancelSettings = store.getCancellationSettings();
  const meetsAdminTerms = hoursUntilStart >= cancelSettings.cutoff_hours;

  // Compute cancellation policy suggestion
  const policies = store.getCancellationPolicies().sort((a, b) => b.hours_before_start - a.hours_before_start);
  let policyPct = 0;
  let matchingTierLabel = 'No refund tier';

  if (hoursUntilStart > 0) {
    // If admin primary terms are configured, check against primary terms and tiers
    if (meetsAdminTerms) {
      policyPct = cancelSettings.refund_percentage;
      matchingTierLabel = `Meets Terms (≥ ${cancelSettings.cutoff_hours}h notice)`;
    } else {
      policyPct = 0;
      matchingTierLabel = `Terms Not Met (< ${cancelSettings.cutoff_hours}h notice)`;
    }

    // Fallback/refinement with any specific custom tiers
    for (const p of policies) {
      if (hoursUntilStart >= p.hours_before_start) {
        policyPct = p.refund_percentage;
        matchingTierLabel = p.label || `≥ ${p.hours_before_start} hours notice`;
        break;
      }
    }
  } else {
    matchingTierLabel = 'Match in progress or passed';
  }

  const policySuggestedAmount = Math.round((totalAmount * policyPct) / 100);

  // Quick preset reasons
  const PRESET_REASONS = [
    'Customer requested cancellation',
    'Heavy rain / Weather disruption',
    'Floodlight / Pitch maintenance issue',
    'Management goodwill / Customer satisfaction',
    'Double-booking resolution'
  ];

  // Synchronize refund amount when mode changes or on modal open
  useEffect(() => {
    if (!isOpen || !booking) return;

    if (refundMode === 'policy') {
      setRefundAmount(policySuggestedAmount);
      setReason(prev => prev || `Policy refund (${hoursUntilStart > 0 ? `${hoursUntilStart.toFixed(1)}h notice` : 'after start'}, ${policyPct}%)`);
    } else if (refundMode === 'full') {
      setRefundAmount(totalAmount);
      setReason(prev => prev || 'Full refund authorized by venue management');
    } else if (refundMode === 'none') {
      setRefundAmount(0);
      setReason(prev => prev || 'Cancelled with zero refund as per venue terms');
    }
    setErrorMsg('');
  }, [isOpen, booking, refundMode, policySuggestedAmount, totalAmount, hoursUntilStart, policyPct]);

  if (!isOpen || !booking) return null;

  const canExecuteRefund = currentAdmin.role === 'owner' || currentAdmin.role === 'manager';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canExecuteRefund) {
      setErrorMsg('Permission Denied: Only Venue Owners and Managers can issue booking refunds.');
      return;
    }

    if (refundAmount < 0 || refundAmount > totalAmount) {
      setErrorMsg(`Refund amount must be between ₹0 and the total paid amount ₹${totalAmount}.`);
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('Please specify a refund or cancellation reason for the audit ledger.');
      return;
    }

    setIsSubmitting(true);
    const finalReason = reason.trim();

    const result = PostgresEngine.updateBookingStatus(booking.id, 'refunded', {
      refundAmount,
      refundReason: finalReason,
      adminId: currentAdmin.id,
      cancelledBy: 'admin',
      noticeHours: Math.max(0, hoursUntilStart),
      metTerms: meetsAdminTerms
    });

    if (result.success) {
      AuditLogger.log(currentAdmin.id, 'ISSUE_REFUND', 'Booking', booking.id, {
        bookingRef: booking.booking_ref,
        originalAmount: totalAmount,
        refundAmount,
        refundMode,
        reason: finalReason,
        adminRole: currentAdmin.role
      });

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } else {
      setIsSubmitting(false);
      setErrorMsg(result.message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-3xl sm:max-w-4xl max-h-[92vh] flex flex-col shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-3.5 bg-surface-container-low border-b border-outline-variant/40 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-headline font-bold text-base text-primary">Process Booking Refund</h3>
              <p className="text-[11px] text-on-surface-variant font-medium">Admin Refund Control & Ledger Override</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3.5 sm:p-4 text-xs overflow-y-auto overscroll-contain space-y-3 flex-1">
          {/* Staff Permission Restriction Warning */}
          {!canExecuteRefund && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-900">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Admin Permission Required</strong>
                <span className="text-[11px]">Staff accounts cannot process refunds. Please request an Owner or Manager to authorize this refund.</span>
              </div>
            </div>
          )}

          {/* 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Left Column: Booking Summary & Policy Terms */}
            <div className="space-y-2.5 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
              {/* Booking Summary Box */}
              <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/30 text-xs space-y-1.5">
                <div className="flex justify-between items-center pb-1 border-b border-outline-variant/20">
                  <span className="font-mono font-bold text-primary">{booking.booking_ref || booking.id}</span>
                  <span className="bg-surface-container-high px-2 py-0.5 rounded text-[10px] font-bold text-on-surface-variant uppercase">
                    Current: {booking.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <p className="text-[10px] text-on-surface-variant font-medium">Customer</p>
                    <p className="font-headline font-bold text-on-surface text-xs">{customer?.name || 'Walk-in Guest'}</p>
                    <p className="font-mono text-[10px] text-on-surface-variant">{formatPhoneNumber(customer?.phone) || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-on-surface-variant font-medium">Slot & Pitch</p>
                    <p className="font-headline font-bold text-on-surface text-xs">{court?.name || 'Court'}</p>
                    <div className="font-mono text-[10px] text-primary font-bold flex items-center gap-1 mt-0.5">
                      <div
                        className={`p-0.5 rounded shrink-0 flex items-center justify-center ${
                          parseInt(booking.start_time.split(':')[0], 10) >= 18 || parseInt(booking.start_time.split(':')[0], 10) < 5
                            ? 'bg-indigo-50 text-indigo-500'
                            : 'bg-amber-50 text-amber-500'
                        }`}
                      >
                        {parseInt(booking.start_time.split(':')[0], 10) >= 18 || parseInt(booking.start_time.split(':')[0], 10) < 5 ? (
                          <Moon className="w-2.5 h-2.5" />
                        ) : (
                          <Sun className="w-2.5 h-2.5" />
                        )}
                      </div>
                      <span>{formatDateDDMMYYYY(booking.booking_date)} ({formatTimeRange12hPlain(booking.start_time, booking.end_time)})</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-outline-variant/20">
                  <span className="text-[11px] text-on-surface-variant font-semibold">Total Paid Amount:</span>
                  <span className="font-headline font-extrabold text-sm text-primary">₹{totalAmount}</span>
                </div>

                {booking.refund_amount !== undefined && booking.refund_amount > 0 && (
                  <div className="flex justify-between items-center pt-0.5 text-red-700 bg-red-50/80 px-2 py-0.5 rounded text-[11px]">
                    <span className="font-medium">Prior Refund:</span>
                    <span className="font-headline font-bold">₹{booking.refund_amount}</span>
                  </div>
                )}
              </div>

              {/* Policy & Time Window Notice Widget */}
              <div className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${
                meetsAdminTerms 
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
                  : 'bg-amber-50/70 border-amber-200 text-amber-950'
              }`}>
                <div className="flex items-center justify-between font-headline font-bold">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Clock className={`w-3.5 h-3.5 ${meetsAdminTerms ? 'text-emerald-700' : 'text-amber-700'}`} />
                    <span>Venue Cancellation Terms</span>
                  </div>
                  <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase ${
                    meetsAdminTerms ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                  }`}>
                    {meetsAdminTerms ? 'Terms Met' : 'Terms Not Met'}
                  </span>
                </div>

                <div className="text-[10.5px] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Required: <strong>≥ {cancelSettings.cutoff_hours}h notice</strong></span>
                    <span>Remaining: <strong>{hoursUntilStart > 0 ? `${hoursUntilStart.toFixed(1)} hrs` : 'Passed'}</strong></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Timeline: <strong>{cancelSettings.processing_business_days} biz days</strong></span>
                    <span>Policy: <strong>{matchingTierLabel} ({policyPct}%)</strong></span>
                  </div>
                </div>

                <div className="text-[10.5px] bg-white/80 px-2 py-1 rounded-lg border border-outline-variant/30 flex justify-between items-center">
                  <span className="font-medium">Calculated Refund:</span>
                  <strong className={`font-headline font-extrabold text-xs ${meetsAdminTerms ? 'text-emerald-700' : 'text-amber-800'}`}>
                    ₹{policySuggestedAmount} ({policyPct}% of ₹{totalAmount})
                  </strong>
                </div>
              </div>
            </div>

            {/* Right Column: Refund Controls, Amount & Reason */}
            <div className="space-y-2.5 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
              <div className="space-y-2.5">
                {/* Refund Amount Mode Selector */}
                <div>
                  <label className="block font-headline font-bold text-on-surface mb-1 text-[11px]">
                    Select Refund Amount Option
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      type="button"
                      onClick={() => setRefundMode('policy')}
                      className={`py-1.5 px-1 rounded-lg font-headline font-bold text-center border transition-all ${
                        refundMode === 'policy'
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : 'bg-surface-container-low text-on-surface border-outline-variant/40 hover:bg-surface-container'
                      }`}
                    >
                      <div className="text-[9.5px] opacity-80 uppercase">Policy</div>
                      <div className="text-[11px]">₹{policySuggestedAmount}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRefundMode('full')}
                      className={`py-1.5 px-1 rounded-lg font-headline font-bold text-center border transition-all ${
                        refundMode === 'full'
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : 'bg-surface-container-low text-on-surface border-outline-variant/40 hover:bg-surface-container'
                      }`}
                    >
                      <div className="text-[9.5px] opacity-80 uppercase">Full</div>
                      <div className="text-[11px]">₹{totalAmount}</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRefundMode('custom');
                        setRefundAmount(Math.round(totalAmount * 0.5));
                      }}
                      className={`py-1.5 px-1 rounded-lg font-headline font-bold text-center border transition-all ${
                        refundMode === 'custom'
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : 'bg-surface-container-low text-on-surface border-outline-variant/40 hover:bg-surface-container'
                      }`}
                    >
                      <div className="text-[9.5px] opacity-80 uppercase">Custom</div>
                      <div className="text-[11px]">Override</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRefundMode('none')}
                      className={`py-1.5 px-1 rounded-lg font-headline font-bold text-center border transition-all ${
                        refundMode === 'none'
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : 'bg-surface-container-low text-on-surface border-outline-variant/40 hover:bg-surface-container'
                      }`}
                    >
                      <div className="text-[9.5px] opacity-80 uppercase">Zero</div>
                      <div className="text-[11px]">₹0</div>
                    </button>
                  </div>
                </div>

                {/* Refund Amount Input with Quick Presets */}
                <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/30 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-headline font-bold text-on-surface flex items-center gap-1 text-[11px]">
                      <DollarSign className="w-3 h-3 text-primary" />
                      <span>Exact Refund Amount (₹)</span>
                    </label>
                    <span className="text-[10px] text-on-surface-variant font-medium">
                      Max: ₹{totalAmount}
                    </span>
                  </div>

                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 font-bold text-on-surface-variant text-xs">₹</span>
                    <input
                      type="number"
                      min="0"
                      max={totalAmount}
                      step="1"
                      value={refundAmount}
                      onChange={e => {
                        setRefundMode('custom');
                        setRefundAmount(Math.max(0, Math.min(totalAmount, Number(e.target.value) || 0)));
                      }}
                      className="form-input pl-6 py-1 font-headline font-extrabold text-sm w-full text-primary"
                      disabled={!canExecuteRefund}
                    />
                  </div>

                  {/* Quick Percentage Presets */}
                  <div className="flex items-center gap-1 pt-0.5">
                    <span className="text-[9.5px] text-on-surface-variant font-bold uppercase">Quick:</span>
                    {[0, 25, 50, 75, 100].map(pct => {
                      const amt = Math.round((totalAmount * pct) / 100);
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            setRefundMode('custom');
                            setRefundAmount(amt);
                          }}
                          className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border transition-colors ${
                            refundAmount === amt
                              ? 'bg-primary text-white border-primary'
                              : 'bg-white text-on-surface border-outline-variant/40 hover:bg-gray-100'
                          }`}
                        >
                          {pct}%
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Refund Reason Selection & Custom Text */}
                <div className="space-y-1">
                  <label className="block font-headline font-bold text-on-surface text-[11px]">
                    Refund Reason / Ledger Note *
                  </label>

                  <div className="flex flex-wrap gap-1">
                    {PRESET_REASONS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setReason(preset)}
                        className={`text-[9.5px] px-2 py-0.5 rounded-full border transition-all ${
                          reason === preset
                            ? 'bg-secondary-container text-on-secondary-container border-secondary-container/80 font-bold'
                            : 'bg-white text-on-surface-variant border-outline-variant/40 hover:bg-gray-50'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Provide reason for issuing this refund..."
                    className="form-input w-full text-xs py-1 font-medium"
                    disabled={!canExecuteRefund}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Error Message Display */}
          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2 border-t border-outline-variant/30">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 py-2 text-xs font-bold"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canExecuteRefund || isSubmitting}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-headline font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {isSubmitting ? 'Processing Refund...' : `Confirm Refund of ₹${refundAmount}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
