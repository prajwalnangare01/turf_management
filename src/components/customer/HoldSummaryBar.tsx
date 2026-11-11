import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronRight, Zap } from 'lucide-react';
import { formatDateReadable } from '../../utils/formatters';

export interface HoldSummaryBarProps {
  /** Number of slots currently held */
  heldCount: number;
  /** Formatted start time, e.g. "06:00 PM" */
  startTime?: string;
  /** Formatted end time, e.g. "07:00 PM" */
  endTime?: string;
  /** Combined fallback interval, e.g. "06:00 PM – 07:00 PM" */
  timeRange?: string;
  /** Date string (YYYY-MM-DD or DD/MM/YYYY) */
  date: string;
  /** Grand total amount in INR */
  totalPrice: number;
  /** Optional epoch timestamp (ms) when slot hold expires */
  expiresAt?: number;
  /** Currency symbol, defaults to '₹' */
  currencySymbol?: string;
  /** Tax subtext, defaults to '(incl. taxes)' */
  taxText?: string;
  /** Optional pitch/court title */
  courtName?: string;
  /** Button label */
  proceedText?: string;
  /** Loading or busy state */
  isLoading?: boolean;
  /** Click callback for the Proceed CTA */
  onProceed: () => void;
  /** Optional custom class overrides */
  className?: string;
  /** Optional callback fired when the 5-minute hold expires */
  onExpire?: () => void;
}

export const HoldSummaryBar: React.FC<HoldSummaryBarProps> = ({
  heldCount,
  startTime: propStartTime,
  endTime: propEndTime,
  timeRange,
  date,
  totalPrice,
  expiresAt,
  currencySymbol = '₹',
  taxText = '(incl. taxes)',
  courtName,
  proceedText = 'PROCEED',
  isLoading = false,
  onProceed,
  className = '',
  onExpire
}) => {
  // 1. Resolve start & end times cleanly
  let startTime = propStartTime;
  let endTime = propEndTime;
  if ((!startTime || !endTime) && timeRange) {
    const parts = timeRange.split(/–|-/);
    startTime = parts[0]?.trim() || '06:00 PM';
    endTime = parts[1]?.trim() || '07:00 PM';
  }
  startTime = startTime || '06:00 PM';
  endTime = endTime || '07:00 PM';

  // 2. Format slash date (e.g. "10/11/2026") matching reference design
  const formattedSlashDate = (() => {
    if (!date) return '10/11/2026';
    if (date.includes('-')) {
      const parts = date.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return date;
  })();

  // Human-readable date fallback for aria labels
  const readableDate = formatDateReadable(date, false);

  // 3. Pluralization & reduced size: "1 Slot Held" vs "2 Slots Held" (no "Slot(s)")
  const slotCountLabel = heldCount === 1 ? '1 Slot Held' : `${heldCount} Slots Held`;

  // 4. Live Countdown Timer (if expiresAt provided or active hold)
  const hasExpiredRef = React.useRef(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => {
    if (!expiresAt) return null;
    return Math.min(300, Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  });

  useEffect(() => {
    if (!expiresAt) {
      setSecondsRemaining(null);
      hasExpiredRef.current = false;
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.min(300, Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      setSecondsRemaining(remaining);
      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpire?.();
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const formattedTimer = secondsRemaining !== null && secondsRemaining > 0
    ? `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`
    : null;

  return (
    <footer
      role="region"
      aria-label={`Booking summary: ${slotCountLabel}, ${startTime} to ${endTime} on ${readableDate}, Total: ${currencySymbol}${totalPrice}`}
      className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-50 animate-modalScaleIn ${className}`}
    >
      <div className="max-w-[1200px] mx-auto w-full px-3.5 py-2.5 sm:px-6 sm:py-3 md:px-8 flex items-center justify-between gap-2.5 sm:gap-4">
        {/* Left Section: 3-Tier Vertical Stack matching exact reference design */}
        <div className="min-w-0 flex flex-col justify-center text-left">
          {/* Row 1: Reduced size "1 Slot Held" Pill Badge */}
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200/70 px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold tracking-tight shadow-2xs select-none">
              <span>{slotCountLabel}</span>
              {formattedTimer && (
                <span className="font-mono text-amber-950 font-extrabold flex items-center gap-0.5">
                  <span className="text-[9px]">⚡</span>
                  <span>{formattedTimer}</span>
                </span>
              )}
            </span>

            {courtName && (
              <span className="hidden md:inline text-[11px] text-gray-400 font-medium truncate max-w-[200px]">
                • {courtName}
              </span>
            )}
          </div>

          {/* Row 2: 📅 Start Time - 🕒 End Time | Date (Exact Reference Design) */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-[10.5px] xs:text-[11.5px] sm:text-xs font-semibold text-gray-800 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis mb-1">
            {/* Calendar icon before start time */}
            <span className="inline-flex items-center gap-1 shrink-0 text-indigo-600">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-gray-900 font-bold">{startTime}</span>
            </span>

            <span className="text-gray-400 font-normal select-none">–</span>

            {/* Clock icon before end time */}
            <span className="inline-flex items-center gap-1 shrink-0 text-emerald-600">
              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-gray-900 font-bold">{endTime}</span>
            </span>

            <span className="text-gray-300 font-light mx-0.5 select-none" aria-hidden="true">|</span>

            {/* Date in DD/MM/YYYY */}
            <span className="text-gray-700 font-semibold shrink-0">
              {formattedSlashDate}
            </span>
          </div>

          {/* Row 3: Bold Emerald Price + incl. taxes gray pill */}
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-lg sm:text-2xl font-black text-emerald-700 tracking-tight leading-none">
              {currencySymbol}{totalPrice.toLocaleString('en-IN')}
            </span>
            {taxText && (
              <span className="bg-gray-100 text-gray-600 font-semibold text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full select-none leading-none shadow-2xs whitespace-nowrap">
                {taxText}
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Vibrant Orange Pill CTA Button */}
        <button
          type="button"
          onClick={onProceed}
          disabled={isLoading}
          className="bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs sm:text-sm tracking-wider uppercase px-4 py-2.5 sm:px-7 sm:py-3 rounded-full shadow-md shadow-orange-500/25 hover:shadow-lg transition-all transform active:scale-95 duration-150 flex items-center gap-1 shrink-0 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{isLoading ? 'PROCESSING...' : proceedText}</span>
          <ChevronRight className="w-4 h-4 stroke-[3]" />
        </button>
      </div>
    </footer>
  );
};

/**
 * Standalone interactive demo of the polished Hold Summary Bar
 */
export const HoldSummaryBarDemo: React.FC = () => {
  return (
    <div className="relative w-full min-h-[140px] bg-slate-100 p-4">
      <HoldSummaryBar
        heldCount={1}
        startTime="06:00 PM"
        endTime="07:00 PM"
        date="2026-11-10"
        totalPrice={1500}
        expiresAt={Date.now() + 299 * 1000}
        courtName="Turf A — FIFA 5-a-side Synthetic"
        onProceed={() => alert('Proceed to checkout clicked!')}
      />
    </div>
  );
};
