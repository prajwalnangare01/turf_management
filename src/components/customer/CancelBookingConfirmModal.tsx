import React, { useState } from 'react';
import { Booking } from '../../types/schema';
import { store } from '../../services/store';
import { formatTimeRange12h, formatDateDDMMYYYY } from '../../utils/formatters';
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  X, 
  RotateCcw, 
  Calendar, 
  ShieldAlert, 
  CreditCard,
  HelpCircle
} from 'lucide-react';

interface CancelBookingConfirmModalProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmed: (refundAmount: number, refundReason: string, metTerms: boolean, noticeHours: number) => void;
}

export const CancelBookingConfirmModal: React.FC<CancelBookingConfirmModalProps> = ({
  booking,
  isOpen,
  onClose,
  onConfirmed
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !booking) return null;

  const courts = store.getCourts();
  const court = courts.find(c => c.id === booking.court_id);
  const totalAmount = booking.total_amount || 0;

  // Retrieve admin configured cancellation settings
  const settings = store.getCancellationSettings();
  const cutoffHours = settings.cutoff_hours;
  const refundPercentage = settings.refund_percentage;
  const businessDays = settings.processing_business_days || '5-7';

  // Calculate hours before start
  const bookingStart = new Date(`${booking.booking_date}T${booking.start_time}:00`);
  const diffHours = (bookingStart.getTime() - Date.now()) / (1000 * 60 * 60);

  const isPast = diffHours <= 0;
  const metTerms = !isPast && diffHours >= cutoffHours;
  const refundAmount = metTerms ? Math.round((totalAmount * refundPercentage) / 100) : 0;

  const handleCancelClick = () => {
    if (isPast) return;
    setIsSubmitting(true);
    const reason = metTerms
      ? `Customer cancellation (${diffHours.toFixed(1)}h notice, met $\\ge$ ${cutoffHours}h terms, ${refundPercentage}% refund)`
      : `Customer cancellation (${diffHours.toFixed(1)}h notice, terms not met (< ${cutoffHours}h), ₹0 refund)`;

    onConfirmed(refundAmount, reason, metTerms, Math.max(0, diffHours));
    setIsSubmitting(false);
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-outline-variant/30 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              metTerms ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-headline font-bold text-base text-primary">Cancel Reservation</h3>
              <p className="text-[11px] text-on-surface-variant font-medium">Refund Breakdown & Policy Verification</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Booking Snapshot */}
        <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 text-xs space-y-1.5">
          <div className="flex justify-between items-center pb-1 border-b border-outline-variant/20">
            <span className="font-mono font-bold text-primary">{booking.booking_ref || booking.id}</span>
            <span className="font-headline font-extrabold text-sm text-on-surface">₹{totalAmount}</span>
          </div>

          <div className="space-y-1 text-on-surface-variant pt-0.5">
            <div className="flex justify-between">
              <span>Court:</span>
              <strong className="text-on-surface font-semibold">{court?.name || 'Sports Pitch'}</strong>
            </div>
            <div className="flex justify-between">
              <span>Slot:</span>
              <strong className="text-primary font-bold">
                {formatDateDDMMYYYY(booking.booking_date)} ({formatTimeRange12h(booking.start_time, booking.end_time)})
              </strong>
            </div>
            <div className="flex justify-between items-center pt-0.5">
              <span>Notice Before Match:</span>
              <strong className={`font-mono font-bold ${diffHours >= cutoffHours ? 'text-emerald-700' : 'text-red-700'}`}>
                {isPast ? 'Match Concluded / Started' : `${diffHours.toFixed(1)} hours`}
              </strong>
            </div>
          </div>
        </div>

        {/* Terms & Conditions Evaluation Card */}
        {isPast ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Cancellation Window Closed</strong>
              <span>This match has already started or finished. Past bookings cannot be cancelled.</span>
            </div>
          </div>
        ) : metTerms ? (
          <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2 font-headline font-bold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Cancellation Terms & Conditions Met</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Your cancellation notice ({diffHours.toFixed(1)} hrs) meets the venue requirement of at least <strong>{cutoffHours} hours</strong> prior to match start.
            </p>

            {/* Refund Highlight */}
            <div className="bg-white/80 p-3 rounded-lg border border-emerald-200/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-on-surface-variant font-medium block">Refund Amount ({refundPercentage}%)</span>
                <span className="font-headline font-black text-xl text-emerald-700">₹{refundAmount}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-on-surface-variant block uppercase font-bold">Settlement Method</span>
                <span className="text-xs font-bold text-on-surface">Original Source Account</span>
              </div>
            </div>

            {/* Business Days Notice */}
            <div className="flex items-start gap-2 text-[11px] text-emerald-900 bg-emerald-100/60 p-2 rounded-lg font-medium">
              <Clock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                Your refund of <strong>₹{refundAmount}</strong> will be processed and credited within <strong>{businessDays} business days</strong>.
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2 font-headline font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Cancellation Terms & Conditions Notice</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              Venue policy requires cancellations to be made at least <strong>{cutoffHours} hours</strong> before match start. Notice provided: <strong>{diffHours.toFixed(1)} hours</strong>.
            </p>

            {/* Refund Zero Highlight */}
            <div className="bg-white/80 p-3 rounded-lg border border-amber-200/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-on-surface-variant font-medium block">Refund Amount</span>
                <span className="font-headline font-black text-xl text-red-600">₹0</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-red-700 block uppercase font-bold">Non-Refundable</span>
                <span className="text-[11px] text-on-surface-variant font-medium">Within {cutoffHours}h cutoff window</span>
              </div>
            </div>

            <p className="text-[10px] text-amber-800 italic">
              Proceeding will cancel your slot and release it for other players, but no refund will be issued under venue terms.
            </p>
          </div>
        )}

        {/* Final Confirmation Question */}
        {!isPast && (
          <p className="text-xs text-on-surface font-semibold text-center pt-1">
            Are you sure you want to proceed with cancelling this booking?
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-2 px-4 text-xs font-bold"
            disabled={isSubmitting}
          >
            Keep My Booking
          </button>
          {!isPast && (
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isSubmitting}
              className={`py-2 px-4 rounded-lg font-headline font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors text-white ${
                metTerms 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isSubmitting ? 'Cancelling...' : metTerms ? `Confirm Cancel (₹${refundAmount} Refund)` : 'Confirm Cancel (₹0 Refund)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
