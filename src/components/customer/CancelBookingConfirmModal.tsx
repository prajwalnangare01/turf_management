import React, { useState, useEffect } from 'react';
import { Booking } from '../../types/schema';
import { store } from '../../services/store';
import { formatTimeRange12h, formatTime12hPlain, formatDateDDMMYYYY } from '../../utils/formatters';
import { TimeOfDayIcon } from '../common/TimeOfDayIcon';
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
  onConfirmed: (
    refundAmount: number, 
    refundReason: string, 
    metTerms: boolean, 
    noticeHours: number
  ) => { success: boolean; message?: string } | void | Promise<{ success: boolean; message?: string } | void>;
  onSuccessDone?: () => void;
}

export const CancelBookingConfirmModal: React.FC<CancelBookingConfirmModalProps> = ({
  booking,
  isOpen,
  onClose,
  onConfirmed,
  onSuccessDone
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state when a new booking is selected or modal opened
  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false);
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [booking?.id, isOpen]);

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

  const handleCancelClick = async () => {
    if (isPast || !booking) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const reason = metTerms
        ? `Customer cancellation (${diffHours.toFixed(1)}h notice, met >= ${cutoffHours}h terms). Pending admin review.`
        : `Customer cancellation (${diffHours.toFixed(1)}h notice, terms not met (< ${cutoffHours}h)). Non-refundable.`;

      const res = await onConfirmed(0, reason, metTerms, Math.max(0, diffHours));
      if (res && typeof res === 'object' && res.success === false) {
        setErrorMessage(res.message || 'Unable to cancel reservation. Please try again.');
        setIsSubmitting(false);
        return;
      }
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Cancellation failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // SUCCESS STATE VIEW: Formatted cancellation success card
  if (isSuccess) {
    return (
      <div className="modal-overlay">
        <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden">
          {/* Success Icon & Header */}
          <div className="text-center space-y-2 pt-1">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner ring-4 ring-emerald-50">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-headline font-extrabold text-lg sm:text-xl text-gray-900">
                Reservation Cancelled Successfully
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Your pitch slot reservation has been cancelled.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-mono text-xs font-bold border border-gray-200">
              <span className="text-gray-500">Ref:</span>
              <span className="text-primary font-bold">{booking.booking_ref || booking.id}</span>
            </div>
          </div>

          {/* Refund Review Card */}
          {metTerms ? (
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 text-center space-y-1.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                Cancellation Request Confirmed
              </span>
              <div className="font-headline font-bold text-base text-emerald-900">
                Eligible for Refund (Up to ₹{refundAmount})
              </div>
              <p className="text-xs text-emerald-950/80 font-medium pt-0.5">
                You met the advance notice cut-off policy. Any refund is reviewed, authorized, and processed directly by venue management.
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center space-y-1.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 block">
                Non-Refundable Cancellation
              </span>
              <div className="font-headline font-bold text-base text-gray-700">
                Inside {cutoffHours}h Window
              </div>
              <p className="text-xs text-gray-600 font-medium pt-0.5">
                Cancelled within the {cutoffHours}-hour matchday cut-off window. As per venue policy, match cancellations inside this window are non-refundable.
              </p>
            </div>
          )}

          {/* Booking Summary Box */}
          <div className="bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/30 text-xs space-y-2">
            <div className="flex justify-between items-center text-gray-600">
              <span className="text-gray-500 font-medium">Court / Pitch:</span>
              <strong className="text-gray-900 font-semibold">{court?.name || 'Pitch'}</strong>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span className="text-gray-500 font-medium">Match Date:</span>
              <strong className="text-gray-900 font-semibold">{formatDateDDMMYYYY(booking.booking_date)}</strong>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span className="text-gray-500 font-medium">Slot Timing:</span>
              <span className="text-primary font-bold flex items-center gap-1">
                <TimeOfDayIcon time24={booking.start_time} className="w-3.5 h-3.5" />
                <span>{formatTime12hPlain(booking.start_time)}</span>
                <span>–</span>
                <TimeOfDayIcon time24={booking.end_time} className="w-3.5 h-3.5" />
                <span>{formatTime12hPlain(booking.end_time)}</span>
              </span>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setIsSuccess(false);
                if (onSuccessDone) {
                  onSuccessDone();
                } else {
                  onClose();
                }
              }}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-headline font-bold text-xs sm:text-sm shadow-sm transition-all duration-150 cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="bg-white border border-outline-variant/60 rounded-3xl sm:rounded-2xl w-full max-w-md p-3.5 sm:p-5 space-y-2.5 shadow-2xl animate-modalScaleIn text-on-surface overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-outline-variant/30 pb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              metTerms ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-headline font-bold text-sm sm:text-base text-primary">Cancel Reservation</h3>
              <p className="text-[10px] sm:text-[11px] text-on-surface-variant font-medium">Refund Breakdown & Policy</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message alert if any */}
        {errorMessage && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Booking Snapshot */}
        <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/30 text-xs space-y-1">
          <div className="flex justify-between items-center pb-1 border-b border-outline-variant/20">
            <span className="font-mono font-bold text-primary text-xs">{booking.booking_ref || booking.id}</span>
            <span className="font-headline font-extrabold text-xs sm:text-sm text-on-surface">Total: ₹{totalAmount}</span>
          </div>

          <div className="space-y-0.5 text-on-surface-variant text-[11px] pt-0.5">
            <div className="flex justify-between">
              <span>Court:</span>
              <strong className="text-on-surface font-semibold">{court?.name || 'Pitch'}</strong>
            </div>
            <div className="flex justify-between items-start">
              <span>Slot:</span>
              <div className="text-right">
                <span className="font-semibold text-on-surface block">{formatDateDDMMYYYY(booking.booking_date)}</span>
                <span className="text-primary font-bold flex items-center justify-end gap-1 mt-0.5">
                  <TimeOfDayIcon time24={booking.start_time} className="w-3 h-3" />
                  <span>{formatTime12hPlain(booking.start_time)}</span>
                  <span>–</span>
                  <TimeOfDayIcon time24={booking.end_time} className="w-3 h-3" />
                  <span>{formatTime12hPlain(booking.end_time)}</span>
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span>Notice:</span>
              <strong className={`font-mono font-bold ${diffHours >= cutoffHours ? 'text-emerald-700' : 'text-red-700'}`}>
                {isPast ? 'Match Started' : `${diffHours.toFixed(1)}h before match`}
              </strong>
            </div>
          </div>
        </div>

        {/* Terms & Conditions Evaluation Card */}
        {isPast ? (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Window Closed</strong>
              <span className="text-[11px]">Past bookings cannot be cancelled.</span>
            </div>
          </div>
        ) : metTerms ? (
          <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-headline font-bold text-emerald-900 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Cancellation Terms Met ({cutoffHours}h Policy)</span>
            </div>

            {/* Refund Eligibility Highlight */}
            <div className="bg-white/90 p-2 rounded-lg border border-emerald-200/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-on-surface-variant font-medium block">Refund Policy Eligibility ({refundPercentage}%)</span>
                <span className="font-headline font-black text-lg text-emerald-700">Up to ₹{refundAmount}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-on-surface-variant block font-bold">Admin Authorization</span>
                <span className="text-[10px] text-emerald-800 font-medium">Reviewed by Venue</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-headline font-bold text-amber-900 text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Notice Less Than {cutoffHours} Hours</span>
            </div>

            {/* Refund Zero Highlight */}
            <div className="bg-white/90 p-2 rounded-lg border border-amber-200/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-on-surface-variant font-medium block">Refund Policy</span>
                <span className="font-headline font-black text-lg text-red-600">₹0</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-red-700 block uppercase font-bold">Non-Refundable</span>
                <span className="text-[10px] text-on-surface-variant">Inside {cutoffHours}h window</span>
              </div>
            </div>
          </div>
        )}

        {/* Final Confirmation Question */}
        {!isPast && (
          <p className="text-[11px] text-on-surface font-semibold text-center">
            Are you sure you want to cancel this booking?
          </p>
        )}

        {/* Action Buttons: 2-column side-by-side */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-2 px-3 text-xs font-bold"
            disabled={isSubmitting}
          >
            Keep Booking
          </button>
          {!isPast && (
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isSubmitting}
              className={`py-2 px-3 rounded-xl font-headline font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-colors text-white cursor-pointer ${
                metTerms 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              {isSubmitting ? 'Cancelling...' : 'Cancel Reservation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
